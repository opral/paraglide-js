import { escapeIdentifier, isReservedBindingName } from "./safe-module-id.js";
import { registryBinding } from "./registry.js";
import type { Declaration } from "@inlang/sdk";
import {
	escapeCommentTerminator,
	escapeForDoubleQuoteString,
} from "../services/codegen/escape.js";

const identifierPattern = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

export function isValidIdentifier(name: string): boolean {
	return identifierPattern.test(name);
}

/** A quoted property name, also in a type inside a JSDoc comment. */
export function quotePropertyKey(name: string): string {
	return escapeCommentTerminator(`"${escapeForDoubleQuoteString(name)}"`);
}

export function compileInputAccess(name: string): string {
	if (isValidIdentifier(name)) {
		return `i?.${name}`;
	}
	return `i?.[${quotePropertyKey(name)}]`;
}

export function compileVariableAccess(
	name: string,
	declarations?: Declaration[]
): string {
	const declaration = declarations?.find(
		(candidate) => candidate.name === name
	);
	return declaration?.type === "local-variable"
		? compileLocalVariableName(name)
		: compileInputAccess(name);
}

/**
 * What a message function reads besides its locals: its inputs, the registry
 * and, in `.parts()`, `String`.
 */
const messageFunctionReads = new Set(["i", registryBinding, "String"]);

/**
 * The binding a message function declares a local variable as: its name,
 * unless that is not an identifier, contains `$`, is reserved or is a name the
 * function reads. Then it is `escapeIdentifier(name)`, which starts with `$`,
 * so no two locals get the same binding.
 *
 * @example
 *   compileLocalVariableName("count") // "count"
 *   compileLocalVariableName("i") // "$i"
 *   compileLocalVariableName("a-b") // "$a$2d$b"
 */
export function compileLocalVariableName(name: string): string {
	return isValidIdentifier(name) &&
		!name.includes("$") &&
		!isReservedBindingName(name) &&
		!messageFunctionReads.has(name)
		? name
		: escapeIdentifier(name);
}
