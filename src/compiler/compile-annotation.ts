import type {
	Declaration,
	FunctionReference,
	Literal,
	VariableReference,
} from "@inlang/sdk";
import { compileVariableAccess } from "./variable-access.js";
import { escapeForDoubleQuoteString } from "../services/codegen/escape.js";

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
	return `registry.${functionName}("${locale}", ${str}, ${compileOptions(annotation.name, annotation.options, declarations)})`;
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
