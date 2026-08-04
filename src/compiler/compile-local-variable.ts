import type {
	Declaration,
	Literal,
	LocalVariable,
	VariableReference,
} from "@inlang/sdk";
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
	declarations?: readonly Declaration[];
}): string {
	const annotation = args.declaration.value.annotation;

	const value = compileAnnotation(
		compileLiteralOrVarRef(args.declaration.value.arg, args.declarations),
		args.locale,
		annotation,
		args.declarations
	);

	return `const ${args.declaration.name} = ${value};`;
}

/**
 * Compiles local declarations in dependency order so a local can reference a
 * declaration that appears later in the source bundle.
 */
export function compileLocalVariables(args: {
	locale: string;
	declarations: readonly Declaration[];
}): string[] {
	const localDeclarations = args.declarations.filter(
		(declaration): declaration is LocalVariable =>
			declaration.type === "local-variable"
	);
	const localByName = new Map(
		localDeclarations.map((declaration) => [declaration.name, declaration])
	);
	const ordered: LocalVariable[] = [];
	const visited = new Set<string>();
	const visiting = new Set<string>();

	const visit = (declaration: LocalVariable): void => {
		if (visited.has(declaration.name)) return;
		if (visiting.has(declaration.name)) return;

		visiting.add(declaration.name);
		const references =
			declaration.value.arg.type === "variable-reference"
				? [declaration.value.arg.name]
				: [];
		for (const option of declaration.value.annotation?.options ?? []) {
			if (option.value.type === "variable-reference") {
				references.push(option.value.name);
			} else if (
				declaration.value.annotation?.name === "relativetime" &&
				option.name === "unit" &&
				option.value.value.startsWith("$") &&
				option.value.value.length > 1
			) {
				references.push(option.value.value.slice(1));
			}
		}
		for (const reference of references) {
			const dependency = localByName.get(reference);
			if (dependency) visit(dependency);
		}
		visiting.delete(declaration.name);
		visited.add(declaration.name);
		ordered.push(declaration);
	};

	for (const declaration of localDeclarations) visit(declaration);

	return ordered.map((declaration) =>
		compileLocalVariable({
			declaration,
			locale: args.locale,
			declarations: args.declarations,
		})
	);
}

function compileLiteralOrVarRef(
	value: Literal | VariableReference,
	declarations?: readonly Declaration[]
): string {
	switch (value.type) {
		case "literal":
			return `"${escapeForDoubleQuoteString(value.value)}"`;
		case "variable-reference":
			if (
				declarations?.some(
					(declaration) =>
						declaration.type === "local-variable" &&
						declaration.name === value.name
				)
			) {
				return value.name;
			}
			return compileInputAccess(value.name);
	}
}
