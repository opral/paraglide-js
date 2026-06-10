import type {
	Attribute,
	Declaration,
	Expression,
	Option,
	Pattern,
	VariableReference,
} from "@inlang/sdk";
import type { Compiled } from "./types.js";
import { escapeForTemplateLiteral } from "../services/codegen/escape.js";
import { compileInputAccess } from "./variable-access.js";
import {
	compileAnnotation,
	isRegistryFunction,
	registryFunctionNamesForDisplay,
} from "./compile-annotation.js";
import { Logger } from "../services/logger/index.js";

export type CompilePatternMode = "string" | "parts";

/**
 * Compiles a pattern into either a template literal string or parts array.
 *
 * @example
 *   const pattern: Pattern = [
 * 	 { type: "text", value: "Your age is " },
 * 	 { type: "expression", arg: { type: "variable-reference", name: "age" } },
 *   ]
 *
 *   const { code } = compilePattern({ pattern, declarations: [{ type: "input-variable", name: "age" }] });
 *
 *   // code will be: `Your age is ${i?.age}`
 */
export const compilePattern = (args: {
	pattern: Pattern;
	declarations: Declaration[];
	mode?: CompilePatternMode;
	/**
	 * The locale of the message the pattern belongs to.
	 *
	 * Required to compile expressions with annotations like
	 * `{ annotation: { type: "function-reference", name: "number" } }`
	 * into `registry.number(locale, ...)` calls.
	 */
	locale?: string;
}): Compiled<Pattern> => {
	const mode = args.mode ?? "string";

	if (mode === "parts") {
		return compilePatternToParts(args);
	}

	return compilePatternToString(args);
};

function compilePatternToString(args: {
	pattern: Pattern;
	declarations: Declaration[];
	locale?: string;
}): Compiled<Pattern> {
	let result = "";

	for (const part of args.pattern) {
		switch (part.type) {
			case "text":
				result += escapeForTemplateLiteral(part.value);
				break;
			case "expression":
				result += `\${${compileExpression(part, args.declarations, args.locale)}}`;
				break;
			case "markup-start":
			case "markup-end":
			case "markup-standalone":
				// Markup wrappers are omitted for plain string output.
				break;
		}
	}

	return {
		code: `\`${result}\``,
		node: args.pattern,
	};
}

function compilePatternToParts(args: {
	pattern: Pattern;
	declarations: Declaration[];
	locale?: string;
}): Compiled<Pattern> {
	const compiledParts: string[] = [];

	for (const part of args.pattern) {
		switch (part.type) {
			case "text":
				compiledParts.push(
					`{ type: "text", value: ${stringLiteral(part.value)} }`
				);
				break;
			case "expression":
				compiledParts.push(
					`{ type: "text", value: String(${compileExpression(
						part,
						args.declarations,
						args.locale
					)}) }`
				);
				break;
			case "markup-start":
			case "markup-end":
			case "markup-standalone":
				compiledParts.push(
					`{ type: ${stringLiteral(part.type)}, name: ${stringLiteral(
						part.name
					)}, options: ${compileMarkupOptions(
						part.options ?? [],
						args.declarations
					)}, attributes: ${compileMarkupAttributes(part.attributes ?? [])} }`
				);
				break;
		}
	}

	return {
		code: `[${compiledParts.join(", ")}]`,
		node: args.pattern,
	};
}

const logger = new Logger();

/**
 * Tracks annotation names that have already been warned about to avoid
 * spamming the console when the same unsupported formatter is used in
 * many messages (or across watch-mode recompiles).
 */
const warnedUnsupportedAnnotations = new Set<string>();

/**
 * Compiles a pattern expression including its annotation (if any).
 *
 * Annotations referencing a registry function compile to a `registry.*`
 * call, identical to annotations on local variable declarations. Unknown
 * annotations fall back to plain interpolation with a warning to avoid
 * breaking compilation of messages imported from other i18n libraries
 * (e.g. i18next's `{{value, customFormat}}`).
 */
function compileExpression(
	expression: Expression,
	declarations: Declaration[],
	locale?: string
): string {
	const value = compileExpressionValue(expression, declarations);
	const annotation = expression.annotation;

	if (!annotation) {
		return value;
	}

	if (!isRegistryFunction(annotation.name)) {
		if (!warnedUnsupportedAnnotations.has(annotation.name)) {
			warnedUnsupportedAnnotations.add(annotation.name);
			logger.warn(
				`The formatter "${annotation.name}" is unknown and will be ignored. The value is interpolated without formatting. Supported formatters: ${registryFunctionNamesForDisplay()}.`
			);
		}
		return value;
	}

	if (locale === undefined) {
		throw new Error(
			`compilePattern() requires a locale to compile the formatter "${annotation.name}".`
		);
	}

	return compileAnnotation(value, locale, annotation);
}

function compileExpressionValue(
	expression: Pick<Expression, "arg">,
	declarations: Declaration[]
): string {
	switch (expression.arg.type) {
		case "literal":
			return stringLiteral(expression.arg.value);
		case "variable-reference":
			return compileVariableReference(expression.arg, declarations);
	}
}

function compileVariableReference(
	reference: VariableReference,
	declarations: Declaration[]
): string {
	const declaration = declarations.find((decl) => decl.name === reference.name);

	if (declaration?.type === "input-variable") {
		return compileInputAccess(reference.name);
	}
	if (declaration?.type === "local-variable") {
		return reference.name;
	}

	throw new Error(
		`Variable reference "${reference.name}" not found in declarations`
	);
}

function compileMarkupOptions(
	options: Option[],
	declarations: Declaration[]
): string {
	if (options.length === 0) {
		return "{}";
	}

	return `{ ${options
		.map(
			(option) =>
				`${stringLiteral(option.name)}: ${compileExpressionValue(
					{ arg: option.value },
					declarations
				)}`
		)
		.join(", ")} }`;
}

function compileMarkupAttributes(attributes: Attribute[]): string {
	if (attributes.length === 0) {
		return "{}";
	}

	return `{ ${attributes
		.map((attribute) => {
			const value =
				attribute.value === true ? "true" : stringLiteral(attribute.value.value);
			return `${stringLiteral(attribute.name)}: ${value}`;
		})
		.join(", ")} }`;
}

function stringLiteral(value: string): string {
	return JSON.stringify(value);
}
