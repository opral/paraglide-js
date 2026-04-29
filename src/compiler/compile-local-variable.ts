import type {
	FunctionReference,
	Literal,
	LocalVariable,
	VariableReference,
} from "@inlang/sdk";
import { compileInputAccess } from "./variable-access.js";
import { escapeForDoubleQuoteString } from "../services/codegen/escape.js";

/**
 * Compiles a local variable.
 *
 * @example
 *   const code = compileLocalVariable({
 *    type: "local-variable",
 *    name: "myVar",
 *    value: { type: "literal", value: "Hello" }
 *   });
 *   >> code === "const myVar = 'Hello';"
 */
export function compileLocalVariable(args: {
	locale: string;
	declaration: LocalVariable;
}): string {
	const annotation = args.declaration.value.annotation;

	const value = compileAnnotation(
		compileLiteralOrVarRef(args.declaration.value.arg),
		args.locale,
		annotation
	);

	return `const ${args.declaration.name} = ${value};`;
}

function compileAnnotation(
	str: string,
	locale: string,
	annotation?: LocalVariable["value"]["annotation"]
): string {
	if (!annotation) {
		return str;
	}
	if (annotation.name === "relativetime") {
		validateRelativeTimeOptions(annotation);
	}
	return `registry.${annotation.name}("${locale}", ${str}, ${compileOptions(annotation.name, annotation.options)})`;
}

function compileOptions(
	annotationName: string,
	options: FunctionReference["options"]
): string {
	if (options.length === 0) {
		return "{}";
	}
	const entries: string[] = options.map(
		(option) =>
			`${option.name}: ${compileOptionLiteralOrVarRef(
				annotationName,
				option.name,
				option.value
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
	value: Literal | VariableReference
): string {
	if (value.type === "variable-reference") {
		if (annotationName === "relativetime" && optionName === "unit") {
			return `/** @type {import("../registry.js").RelativeTimeFormatUnit} */ (${compileInputAccess(value.name)})`;
		}
		return compileInputAccess(value.name);
	}

	if (
		annotationName === "relativetime" &&
		optionName === "unit" &&
		isDollarVariableReference(value.value)
	) {
		return `/** @type {import("../registry.js").RelativeTimeFormatUnit} */ (${compileInputAccess(value.value.slice(1))})`;
	}

	if (shouldEmitNumberLiteral(annotationName, optionName, value.value)) {
		return value.value;
	}

	if (shouldEmitBooleanLiteral(annotationName, optionName, value.value)) {
		return value.value;
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

function compileLiteralOrVarRef(value: Literal | VariableReference): string {
	switch (value.type) {
		case "literal":
			return `"${escapeForDoubleQuoteString(value.value)}"`;
		case "variable-reference":
			return compileInputAccess(value.name);
	}
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

function isDollarVariableReference(value: string): boolean {
	return value.startsWith("$") && value.length > 1;
}
