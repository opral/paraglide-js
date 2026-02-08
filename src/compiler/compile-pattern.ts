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
}): Compiled<Pattern> {
	let result = "";

	for (const part of args.pattern) {
		switch (part.type) {
			case "text":
				result += escapeForTemplateLiteral(part.value);
				break;
			case "expression":
				result += `\${${compileExpressionValue(part, args.declarations)}}`;
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
					`{ type: "text", value: String(${compileExpressionValue(
						part,
						args.declarations
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
