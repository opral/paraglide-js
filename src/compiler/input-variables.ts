import type { Declaration, InputVariable, Option, Pattern } from "@inlang/sdk";

/**
 * Returns the declared input variables plus inputs referenced by local
 * declarations without a corresponding declaration.
 *
 * Message Format permits local declarations such as `local formatted = count:
 * number` without an explicit `input count` declaration. The generated local
 * variable still reads `i.count`, so those references must be reflected in the
 * generated function signature and input type.
 */
export function getInputVariables(
	declarations: readonly Declaration[],
	patterns: readonly Pattern[] = []
): InputVariable[] {
	const declaredNames = new Set(
		declarations.map((declaration) => declaration.name)
	);
	const inputs = declarations.filter(
		(declaration): declaration is InputVariable =>
			declaration.type === "input-variable"
	);

	const references: string[] = [];
	for (const declaration of declarations) {
		if (declaration.type !== "local-variable") continue;

		if (declaration.value.arg.type === "variable-reference") {
			references.push(declaration.value.arg.name);
		}
		collectOptionReferences(
			declaration.value.annotation?.name,
			declaration.value.annotation?.options ?? [],
			references
		);
	}

	for (const pattern of patterns) {
		for (const part of pattern) {
			if (part.type === "expression") {
				if (part.arg.type === "variable-reference") {
					references.push(part.arg.name);
				}
				collectOptionReferences(
					part.annotation?.name,
					part.annotation?.options ?? [],
					references
				);
			} else if (
				part.type === "markup-start" ||
				part.type === "markup-end" ||
				part.type === "markup-standalone"
			) {
				collectOptionReferences(undefined, part.options ?? [], references);
			}
		}
	}

	for (const name of references) {
		if (declaredNames.has(name)) continue;

		inputs.push({ type: "input-variable", name });
		declaredNames.add(name);
	}

	return inputs;
}

/**
 * Adds inferred input declarations to a bundle without changing the order of
 * existing declarations.
 */
export function getEffectiveDeclarations(
	declarations: readonly Declaration[],
	patterns: readonly Pattern[] = []
): Declaration[] {
	const declaredNames = new Set(
		declarations.map((declaration) => declaration.name)
	);
	const inferredInputs = getInputVariables(declarations, patterns).filter(
		(input) => !declaredNames.has(input.name)
	);

	return [...declarations, ...inferredInputs];
}

function collectOptionReferences(
	annotationName: string | undefined,
	options: readonly Option[],
	references: string[]
): void {
	for (const option of options) {
		if (option.value.type === "variable-reference") {
			references.push(option.value.name);
		} else if (
			annotationName === "relativetime" &&
			option.name === "unit" &&
			option.value.value.startsWith("$") &&
			option.value.value.length > 1
		) {
			references.push(option.value.value.slice(1));
		}
	}
}
