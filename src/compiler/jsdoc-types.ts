import type { InputVariable } from "@inlang/sdk";
import { isValidIdentifier, quotePropertyKey } from "./variable-access.js";

export type InputMatchTypes = Map<
	string,
	{ literals: Set<string>; hasCatchAll: boolean }
>;

export function jsDocBundleFunctionTypes(args: {
	inputs: InputVariable[];
	locales: string[];
	matchTypes?: InputMatchTypes;
	inputTypeOverride?: string;
}): string {
	const localesUnion = args.locales.map((locale) => `"${locale}"`).join(" | ");
	const inputType = args.inputTypeOverride ?? inputsType(args.inputs, args.matchTypes);

	return `
* @param {${inputType}} inputs
* @param {{ locale?: ${localesUnion} }} options
* @returns {LocalizedString}`;
}

/**
 * Returns the types for the input variables.
 *
 * @example
 *   const inputs = [{ name: "age" }]
 *   inputsType(inputs)
 *   >> "{ age: NonNullable<unknown> }"
 */
export function inputsType(
	inputs: InputVariable[],
	matchTypes?: InputMatchTypes
): string {
	if (inputs.length === 0) {
		return "{}";
	}

	// Deduplicate inputs by name to avoid TypeScript errors with duplicate properties in JSDoc
	const uniqueInputMap = new Map<string, InputVariable>();

	for (const input of inputs) {
		uniqueInputMap.set(input.name, input);
	}

	const uniqueInputs = Array.from(uniqueInputMap.values());

	const inputParams = uniqueInputs
		.map((input) => {
			const name = isValidIdentifier(input.name)
				? input.name
				: quotePropertyKey(input.name);
			return `${name}: ${resolveInputType(input.name, matchTypes)}`;
		})
		.join(", ");
	return `{ ${inputParams} }`;
}

function resolveInputType(name: string, matchTypes?: InputMatchTypes): string {
	if (!matchTypes) return "NonNullable<unknown>";

	const info = matchTypes.get(name);
	if (!info) return "NonNullable<unknown>";
	if (info.hasCatchAll) return "NonNullable<unknown>";

	const literals = Array.from(info.literals);
	if (literals.length === 0) return "NonNullable<unknown>";

	literals.sort();
	return literals.map((value) => JSON.stringify(value)).join(" | ");
}

export function inputTypeForName(
	name: string,
	matchTypes?: InputMatchTypes
): string {
	return resolveInputType(name, matchTypes);
}
