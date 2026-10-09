import type {
	Declaration,
	FunctionReference,
	Literal,
	VariableReference,
} from "@inlang/sdk";
import { compileVariableAccess } from "./variable-access.js";
import { escapeForDoubleQuoteString } from "../services/codegen/escape.js";
import { Logger } from "../services/logger/index.js";

/**
 * The functions shipped in the generated registry.js file, by the annotation
 * name that calls them.
 *
 * @see createRegistry()
 */
const registryFunctionByAnnotation = new Map([
	["plural", "plural"],
	["number", "number"],
	["datetime", "datetime"],
	["relativetime", "relativetime"],
	// `#` in ICU MessageFormat 1 plurals, as imported by the ICU1 plugin
	["icu:pound", "icuPound"],
	// `{d, date, short}` and `{d, time, short}` in ICU MessageFormat 1, as
	// imported by the ICU1 plugin, see icuStyleAnnotation()
	["date", "datetime"],
	["time", "datetime"],
]);

const displayedRegistryFunctions = [
	"plural",
	"number",
	"datetime",
	"relativetime",
];

export function isRegistryFunction(name: string): boolean {
	return registryFunctionByAnnotation.has(name);
}

export function registryFunctionNamesForDisplay(): string {
	return displayedRegistryFunctions.join(", ");
}

const logger = new Logger();

/**
 * Tracks annotation names that have already been warned about to avoid
 * spamming the console when the same unsupported formatter is used in
 * many messages (or across watch-mode recompiles).
 */
const warnedUnsupportedAnnotations = new Set<string>();

/**
 * Returns the value unformatted, and warns once per formatter name.
 *
 * Unknown annotations, on pattern expressions and on local variables, fall
 * back to plain interpolation to avoid breaking compilation of messages
 * imported from other i18n libraries (e.g. i18next's `{{value, customFormat}}`).
 */
export function ignoreUnknownFormatter(name: string, value: string): string {
	if (!warnedUnsupportedAnnotations.has(name)) {
		warnedUnsupportedAnnotations.add(name);
		logger.warn(
			`The formatter "${name}" is unknown and will be ignored. The value is interpolated without formatting. Supported formatters: ${registryFunctionNamesForDisplay()}.`
		);
	}
	return value;
}

/**
 * The names of the registry functions a message calls, collected while it is
 * compiled. The output decides from it whether to import the registry.
 */
export type RegistryUsage = Set<string>;

/**
 * Wraps a compiled expression value in a `registry.*` call if an
 * annotation is present.
 *
 * @example
 *   compileAnnotation("i?.count", "en", { type: "function-reference", name: "number", options: [] })
 *   >> 'registry.number("en", i?.count, {})'
 */
export function compileAnnotation(
	str: string,
	locale: string,
	annotation?: FunctionReference,
	declarations?: Declaration[],
	registryUsage?: RegistryUsage
): string {
	if (!annotation) {
		return str;
	}
	if (annotation.name === "relativetime") {
		validateRelativeTimeOptions(annotation);
	}
	if (offsetAnnotations.has(annotation.name)) {
		validateOffsetOptions(annotation);
	}
	const functionName =
		registryFunctionByAnnotation.get(annotation.name) ?? annotation.name;
	registryUsage?.add(functionName);
	const options = icuStyleAnnotation(annotation).options;
	// the options of `date` and `time` are those of `datetime`
	const optionsOf = functionName === "datetime" ? "datetime" : annotation.name;
	return `registry.${functionName}("${locale}", ${str}, ${compileOptions(optionsOf, options, declarations)})`;
}

const icuDateTimeStyles = new Set(["short", "medium", "long", "full"]);

const intlNumberStyles = new Set(["decimal", "percent", "currency", "unit"]);

/**
 * Translates the ICU MessageFormat 1 `style` of an annotation to the options
 * of the registry function.
 *
 * The ICU1 plugin imports `{n, number, integer}` as `{$n :number style=integer}`
 * and `{d, date, short}` as `{$d :date style=short}`. Intl knows the number
 * styles "decimal", "percent", "currency" (with a `currency`) and "unit", and
 * throws for others. The date and time styles are Intl's `dateStyle` and
 * `timeStyle`. A style without an Intl equivalent, like an ICU skeleton
 * (`::currency/EUR`), is left out with a warning.
 *
 * @example
 *   icuStyleAnnotation({ name: "date", options: [{ name: "style", value: "short" }] })
 *   >> { name: "date", options: [{ name: "dateStyle", value: "short" }] }
 */
export function icuStyleAnnotation(
	annotation: FunctionReference
): FunctionReference {
	const style = annotation.options.find((option) => option.name === "style");
	const others = annotation.options.filter((option) => option !== style);
	const literal = (name: string, value: string) => ({
		name,
		value: { type: "literal" as const, value },
	});

	if (annotation.name === "date" || annotation.name === "time") {
		const optionName = annotation.name === "date" ? "dateStyle" : "timeStyle";
		if (style?.value.type === "literal") {
			if (icuDateTimeStyles.has(style.value.value)) {
				return {
					...annotation,
					options: [literal(optionName, style.value.value), ...others],
				};
			}
			ignoreUnknownStyle(annotation.name, style.value.value);
		} else if (style) {
			return {
				...annotation,
				options: [{ name: optionName, value: style.value }, ...others],
			};
		}
		// ICU's default time style is "medium". The default date is Intl's.
		return {
			...annotation,
			options:
				annotation.name === "time"
					? [literal(optionName, "medium"), ...others]
					: others,
		};
	}

	if (annotation.name === "number" && style?.value.type === "literal") {
		const value = style.value.value;
		if (value === "integer") {
			return {
				...annotation,
				options: [literal("maximumFractionDigits", "0"), ...others],
			};
		}
		const hasCurrency = others.some((option) => option.name === "currency");
		if (
			!intlNumberStyles.has(value) ||
			(value === "currency" && !hasCurrency)
		) {
			ignoreUnknownStyle(annotation.name, value);
			return { ...annotation, options: others };
		}
	}

	return annotation;
}

const warnedUnknownStyles = new Set<string>();

function ignoreUnknownStyle(name: string, style: string): void {
	const key = `${name} ${style}`;
	if (warnedUnknownStyles.has(key)) return;
	warnedUnknownStyles.add(key);
	logger.warn(
		`The style "${style}" of the formatter "${name}" is not supported and will be ignored.${
			name === "number" && style === "currency"
				? ' The "currency" style needs a "currency" option.'
				: ""
		}`
	);
}

/**
 * Returns the names of the variables the compiled options of an annotation
 * read.
 *
 * @example
 *   // {$date :relativetime unit=$unit}
 *   annotationVariableReferences(annotation) // ["unit"]
 */
export function annotationVariableReferences(
	annotation: FunctionReference
): string[] {
	const names: string[] = [];
	for (const option of annotation.options) {
		if (option.value.type === "variable-reference") {
			names.push(option.value.name);
		} else if (
			annotation.name === "relativetime" &&
			option.name === "unit" &&
			isDollarVariableReference(option.value.value)
		) {
			names.push(option.value.value.slice(1));
		}
	}
	return names;
}

function compileOptions(
	annotationName: string,
	options: FunctionReference["options"],
	declarations?: Declaration[]
): string {
	if (options.length === 0) {
		return "{}";
	}
	const entries: string[] = options.map(
		(option) =>
			`${option.name}: ${compileOptionLiteralOrVarRef(
				annotationName,
				option.name,
				option.value,
				declarations
			)}`
	);
	const code = "{ " + entries.join(", ") + " }";

	return code;
}

const numericOptionNamesByAnnotation: Record<string, ReadonlySet<string>> = {
	number: new Set([
		"minimumIntegerDigits",
		"minimumFractionDigits",
		"maximumFractionDigits",
		"minimumSignificantDigits",
		"maximumSignificantDigits",
		"roundingIncrement",
	]),
	plural: new Set([
		"minimumIntegerDigits",
		"minimumFractionDigits",
		"maximumFractionDigits",
		"minimumSignificantDigits",
		"maximumSignificantDigits",
	]),
	datetime: new Set(["fractionalSecondDigits"]),
};

const booleanOptionNamesByAnnotation: Record<string, ReadonlySet<string>> = {
	number: new Set(["useGrouping"]),
	datetime: new Set(["hour12"]),
};

const jsNonNegativeIntegerPattern = /^(?:0|[1-9]\d*)$/;

function compileOptionLiteralOrVarRef(
	annotationName: string,
	optionName: string,
	value: Literal | VariableReference,
	declarations?: Declaration[]
): string {
	if (value.type === "variable-reference") {
		if (annotationName === "relativetime" && optionName === "unit") {
			return `/** @type {import("../registry.js").RelativeTimeFormatUnit} */ (${compileVariableAccess(value.name, declarations)})`;
		}
		return compileVariableAccess(value.name, declarations);
	}

	if (
		annotationName === "relativetime" &&
		optionName === "unit" &&
		isDollarVariableReference(value.value)
	) {
		return `/** @type {import("../registry.js").RelativeTimeFormatUnit} */ (${compileVariableAccess(value.value.slice(1), declarations)})`;
	}

	if (shouldEmitNumberLiteral(annotationName, optionName, value.value)) {
		return value.value;
	}

	if (shouldEmitBooleanLiteral(annotationName, optionName, value.value)) {
		return value.value;
	}

	if (offsetAnnotations.has(annotationName) && optionName === "offset") {
		// validated by validateOffsetOptions()
		return String(Number(value.value));
	}

	return `"${escapeForDoubleQuoteString(value.value)}"`;
}

function shouldEmitNumberLiteral(
	annotationName: string,
	optionName: string,
	literal: string
): boolean {
	return (
		numericOptionNamesByAnnotation[annotationName]?.has(optionName) === true &&
		jsNonNegativeIntegerPattern.test(literal)
	);
}

function shouldEmitBooleanLiteral(
	annotationName: string,
	optionName: string,
	literal: string
): boolean {
	return (
		booleanOptionNamesByAnnotation[annotationName]?.has(optionName) === true &&
		(literal === "true" || literal === "false")
	);
}

const relativeTimeUnits = new Set([
	"year",
	"years",
	"quarter",
	"quarters",
	"month",
	"months",
	"week",
	"weeks",
	"day",
	"days",
	"hour",
	"hours",
	"minute",
	"minutes",
	"second",
	"seconds",
]);

function validateRelativeTimeOptions(annotation: FunctionReference): void {
	const unitOptions = annotation.options.filter(
		(option) => option.name === "unit"
	);

	if (unitOptions.length === 0) {
		throw new Error('The "relativetime" formatter requires a "unit" option.');
	}

	if (unitOptions.length > 1) {
		throw new Error(
			'The "relativetime" formatter requires exactly one "unit" option.'
		);
	}

	const [unitOption] = unitOptions;
	if (!unitOption || unitOption.value.type === "variable-reference") {
		return;
	}

	if (isDollarVariableReference(unitOption.value.value)) {
		return;
	}

	if (!relativeTimeUnits.has(unitOption.value.value)) {
		throw new Error(
			`Invalid "relativetime" unit "${unitOption.value.value}". Expected one of: ${Array.from(
				relativeTimeUnits
			).join(", ")}.`
		);
	}
}

/**
 * Annotations with an ICU MessageFormat 1 plural `offset` option.
 *
 * `{count, plural, offset:1 …}` imports as `{$count :plural offset=1}`, and
 * `#` inside it as `{$count :icu:pound offset=1}`. The registry subtracts the
 * offset from the input, so it has to be a number.
 */
const offsetAnnotations = new Set(["plural", "icu:pound"]);

const offsetPattern = /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/;

function validateOffsetOptions(annotation: FunctionReference): void {
	for (const option of annotation.options) {
		if (
			option.name === "offset" &&
			option.value.type === "literal" &&
			!offsetPattern.test(option.value.value)
		) {
			throw new Error(
				`Invalid "${annotation.name}" offset "${option.value.value}". Expected a number.`
			);
		}
	}
}

function isDollarVariableReference(value: string): boolean {
	return value.startsWith("$") && value.length > 1;
}
