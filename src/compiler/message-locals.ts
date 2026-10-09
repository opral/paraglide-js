import type {
	Declaration,
	FunctionReference,
	LocalVariable,
	Pattern,
} from "@inlang/sdk";
import {
	annotationVariableReferences,
	isRegistryFunction,
} from "./compile-annotation.js";
import type { CompilePatternMode } from "./compile-pattern.js";

/**
 * Returns the names of the variables a compiled pattern reads.
 *
 * Mirrors what `compilePattern()` emits: expression arguments, the options of
 * registry function annotations (unknown annotations are dropped from the
 * output), and in `parts` mode the options of markup.
 */
export function patternVariableReferences(
	pattern: Pattern,
	mode: CompilePatternMode
): string[] {
	const names: string[] = [];

	for (const part of pattern) {
		if (part.type === "expression") {
			if (part.arg.type === "variable-reference") {
				names.push(part.arg.name);
			}
			if (part.annotation && isRegistryFunction(part.annotation.name)) {
				names.push(...annotationVariableReferences(part.annotation));
			}
		} else if (part.type !== "text" && mode === "parts") {
			for (const option of part.options ?? []) {
				if (option.value.type === "variable-reference") {
					names.push(option.value.name);
				}
			}
		}
	}

	return names;
}

/**
 * Returns the names of the variables a compiled local variable reads.
 *
 * Mirrors what `compileLocalVariable()` emits: the argument and the options
 * of a registry function annotation (unknown annotations are dropped).
 */
export function localVariableReferences(declaration: LocalVariable): string[] {
	const names: string[] = [];
	if (declaration.value.arg.type === "variable-reference") {
		names.push(declaration.value.arg.name);
	}
	const annotation: FunctionReference | undefined =
		declaration.value.annotation;
	if (annotation && isRegistryFunction(annotation.name)) {
		names.push(...annotationVariableReferences(annotation));
	}
	return names;
}

/**
 * Resolves the local variables a message function has to declare.
 *
 * Starting from the variables the function body reads (patterns, match
 * conditions), it follows local variables to the variables they read in turn
 * and returns only the locals that are read, ordered so that every local is
 * declared after the locals it reads. Locals the message does not read are
 * left out, so the output passes `noUnusedLocals`.
 *
 * Throws if a read variable is not declared, or if locals reference each
 * other in a cycle, because the emitted code would throw a `ReferenceError`
 * at runtime.
 *
 * @example
 *   // .input {$count}
 *   // .local countPlural = {$count :plural}
 *   // .local countPluralExact = {$count}
 *   resolveMessageLocals({ reads: ["countPlural"], ... })
 *   // { locals: [countPlural], readsInput: true }
 */
export function resolveMessageLocals(args: {
	reads: Iterable<string>;
	declarations: readonly Declaration[];
	bundleId: string;
	locale: string;
}): { locals: LocalVariable[]; readsInput: boolean } {
	// first declaration wins, consistent with compileVariableAccess()
	const declarationsByName = new Map<string, Declaration>();
	for (const declaration of args.declarations) {
		if (!declarationsByName.has(declaration.name)) {
			declarationsByName.set(declaration.name, declaration);
		}
	}

	const where = `message "${args.bundleId}" (locale "${args.locale}")`;
	const used = new Set<string>();
	let readsInput = false;

	const read = (name: string, readBy?: string) => {
		const declaration = declarationsByName.get(name);
		if (!declaration) {
			throw new Error(
				`The ${where} references the variable "${name}"${
					readBy ? ` in the local variable "${readBy}"` : ""
				}, but "${name}" is not declared. Declare it as an input variable or a local variable.`
			);
		}
		if (declaration.type === "input-variable") {
			readsInput = true;
			return;
		}
		if (used.has(name)) {
			return;
		}
		used.add(name);
		for (const dependency of localVariableReferences(declaration)) {
			read(dependency, name);
		}
	};

	for (const name of args.reads) {
		read(name);
	}

	// Topological order. Locals keep their declaration order unless a local
	// reads one that is declared after it.
	const locals: LocalVariable[] = [];
	const state = new Map<string, "visiting" | "done">();
	const visit = (name: string, path: string[]) => {
		const declaration = declarationsByName.get(name);
		if (declaration?.type !== "local-variable") {
			return;
		}
		const current = state.get(name);
		if (current === "done") {
			return;
		}
		if (current === "visiting") {
			const cycle = [...path.slice(path.indexOf(name)), name];
			throw new Error(
				`The ${where} has local variables that reference each other in a cycle: ${cycle.join(" -> ")}.`
			);
		}
		state.set(name, "visiting");
		for (const dependency of localVariableReferences(declaration)) {
			visit(dependency, [...path, name]);
		}
		state.set(name, "done");
		locals.push(declaration);
	};

	for (const declaration of declarationsByName.values()) {
		if (declaration.type === "local-variable" && used.has(declaration.name)) {
			visit(declaration.name, []);
		}
	}

	return { locals, readsInput };
}
