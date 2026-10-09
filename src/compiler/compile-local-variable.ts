import type {
	Declaration,
	Literal,
	LocalVariable,
	VariableReference,
} from "@inlang/sdk";
import { compileVariableAccess } from "./variable-access.js";
import { escapeForDoubleQuoteString } from "../services/codegen/escape.js";
import {
	compileAnnotation,
	ignoreUnknownFormatter,
	isRegistryFunction,
	type RegistryUsage,
} from "./compile-annotation.js";

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
	declarations?: Declaration[];
	/** Collects the registry functions the compiled local calls. */
	registryUsage?: RegistryUsage;
}): string {
	const annotation = args.declaration.value.annotation;
	const arg = compileLiteralOrVarRef(
		args.declaration.value.arg,
		args.declarations
	);

	const value =
		annotation && !isRegistryFunction(annotation.name)
			? ignoreUnknownFormatter(annotation.name, arg)
			: compileAnnotation(
					arg,
					args.locale,
					annotation,
					args.declarations,
					args.registryUsage
				);

	return `const ${args.declaration.name} = ${value};`;
}

function compileLiteralOrVarRef(
	value: Literal | VariableReference,
	declarations?: Declaration[]
): string {
	switch (value.type) {
		case "literal":
			return `"${escapeForDoubleQuoteString(value.value)}"`;
		case "variable-reference":
			return compileVariableAccess(value.name, declarations);
	}
}
