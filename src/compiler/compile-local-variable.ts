import type { Literal, LocalVariable, VariableReference } from "@inlang/sdk";
import { compileInputAccess } from "./variable-access.js";
import { escapeForDoubleQuoteString } from "../services/codegen/escape.js";
import { compileAnnotation } from "./compile-annotation.js";

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

function compileLiteralOrVarRef(value: Literal | VariableReference): string {
	switch (value.type) {
		case "literal":
			return `"${escapeForDoubleQuoteString(value.value)}"`;
		case "variable-reference":
			return compileInputAccess(value.name);
	}
}
