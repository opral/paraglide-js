import type { Declaration } from "@inlang/sdk";

/**
 * Returns the name of the input a variable holds the unmodified value of, or
 * `undefined` if the variable can hold anything else.
 *
 * Inputs resolve to themselves. A local variable resolves to an input when it
 * is an un-annotated reference to an input, directly or through a chain of
 * un-annotated local variables. Annotated locals (`:plural`, `:number`, ...)
 * and literal values do not resolve, because their value is not the input.
 *
 * Message selectors use this to match aliases like the ones ICU MessageFormat 1
 * imports produce for exact number cases (`=0`) the same way as the input:
 *
 * @example
 *   // .input {$count}
 *   // .local countPluralExact = {$count}
 *   // .local countPlural = {$count :plural}
 *   resolveInputAlias("countPluralExact", declarations) // "count"
 *   resolveInputAlias("countPlural", declarations) // undefined
 */
export function resolveInputAlias(
	name: string,
	declarations: readonly Declaration[]
): string | undefined {
	const visited = new Set<string>();
	let current = name;

	while (!visited.has(current)) {
		visited.add(current);
		// first declaration wins, consistent with compileVariableAccess()
		const declaration = declarations.find(
			(candidate) => candidate.name === current
		);
		if (!declaration) {
			return undefined;
		}
		if (declaration.type === "input-variable") {
			return declaration.name;
		}
		if (
			declaration.value.annotation ||
			declaration.value.arg.type !== "variable-reference"
		) {
			return undefined;
		}
		current = declaration.value.arg.name;
	}

	// cyclic local variable references
	return undefined;
}
