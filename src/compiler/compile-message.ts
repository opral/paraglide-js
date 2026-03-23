import type { Declaration, Message, Pattern, Variant } from "@inlang/sdk";
import { compilePattern } from "./compile-pattern.js";
import type { Compiled } from "./types.js";
import { doubleQuote } from "../services/codegen/quotes.js";
import { inputsType, type InputMatchTypes } from "./jsdoc-types.js";
import { compileLocalVariable } from "./compile-local-variable.js";
import { compileInputAccess } from "./variable-access.js";

/**
 * Returns the compiled message as a string
 *
 */
export const compileMessage = (
	declarations: Declaration[],
	message: Message,
	variants: Variant[],
	matchTypes?: InputMatchTypes,
	inputTypeAliasName?: string
): Compiled<Message> => {
	// return empty string instead?
	if (variants.length == 0) {
		throw new Error("Message must have at least one variant");
	}

	const hasMultipleVariants = variants.length > 1;
	return hasMultipleVariants
		? compileMessageWithMultipleVariants(
				declarations,
				message,
				variants,
				matchTypes,
				inputTypeAliasName
			)
		: compileMessageWithOneVariant(
				declarations,
				message,
				variants,
				matchTypes,
				inputTypeAliasName
			);
};

function compileMessageWithOneVariant(
	declarations: Declaration[],
	message: Message,
	variants: Variant[],
	matchTypes?: InputMatchTypes,
	inputTypeAliasName?: string
): Compiled<Message> {
	const variant = variants[0];
	if (!variant || variants.length !== 1) {
		throw new Error("Message must have exactly one variant");
	}

	const hasMarkup = patternHasMarkup(variant.pattern);
	const inputs = declarations.filter((decl) => decl.type === "input-variable");
	const hasInputs = inputs.length > 0;
	const messageInputType = inputTypeAliasName ?? inputsType(inputs, matchTypes);
	const compiledPattern = compilePattern({
		pattern: variant.pattern,
		declarations,
	});

	const compiledLocalVariables = [];

	for (const declaration of declarations) {
		if (declaration.type === "local-variable") {
			compiledLocalVariables.push(
				compileLocalVariable({ declaration, locale: message.locale })
			);
		}
	}

	if (!hasMarkup) {
		const code = `/** @type {(inputs: ${messageInputType}) => LocalizedString} */ (${hasInputs ? "i" : ""}) => {
	${compiledLocalVariables.join("\n\t")}return /** @type {LocalizedString} */ (${compiledPattern.code})
};`;

		return { code, node: message };
	}

	const compiledPartsPattern = compilePattern({
		pattern: variant.pattern,
		declarations,
		mode: "parts",
	});
	const localVariablesCode = compiledLocalVariables.length
		? compiledLocalVariables.join("\n\t") + "\n\t"
		: "";
	const inputType = messageInputType;
	const messageInput = hasInputs ? "i" : "";

	const partsCode = `/** @type {((inputs: ${inputType}) => LocalizedString) & { parts: (inputs: ${inputType}) => import('../runtime.js').MessagePart[] }} */ (
	/* @__PURE__ */ Object.assign(
		/** @type {(inputs: ${inputType}) => LocalizedString} */ ((${messageInput}) => {
			${localVariablesCode}return /** @type {LocalizedString} */ (${compiledPattern.code})
		}),
		{
			parts: /** @type {(inputs: ${inputType}) => import('../runtime.js').MessagePart[]} */ ((${messageInput}) => {
				${localVariablesCode}return /** @type {import('../runtime.js').MessagePart[]} */ (${compiledPartsPattern.code})
			})
		}
	)
);`;

	return { code: partsCode, node: message };
}

function compileMessageWithMultipleVariants(
	declarations: Declaration[],
	message: Message,
	variants: Variant[],
	matchTypes?: InputMatchTypes,
	inputTypeAliasName?: string
): Compiled<Message> {
	if (variants.length <= 1) {
		throw new Error("Message must have more than one variant");
	}

	const hasMarkup = variants.some((variant) => patternHasMarkup(variant.pattern));
	const inputs = declarations.filter((decl) => decl.type === "input-variable");
	const hasInputs = inputs.length > 0;
	const messageInputType = inputTypeAliasName ?? inputsType(inputs, matchTypes);

	// TODO make sure that matchers use keys instead of indexes
	const compiledVariants = [];
	const compiledPartsVariants = [];

	let hasCatchAll = false;

	for (const variant of variants) {
		const compiledPattern = compilePattern({
			pattern: variant.pattern,
			declarations,
		});
		const compiledPartsPattern = hasMarkup
			? compilePattern({
					pattern: variant.pattern,
					declarations,
					mode: "parts",
				})
			: undefined;

		const isCatchAll = variant.matches.every(
			(match) => match.type === "catchall-match"
		);

		if (isCatchAll) {
			compiledVariants.push(
				`return /** @type {LocalizedString} */ (${compiledPattern.code})`
			);
			if (compiledPartsPattern) {
				compiledPartsVariants.push(
					`return /** @type {import('../runtime.js').MessagePart[]} */ (${compiledPartsPattern.code})`
				);
			}
			hasCatchAll = true;
		}

		const conditions: string[] = [];

		for (const match of variant.matches) {
			// catch all matches are not used in the conditions
			if (match.type !== "literal-match") {
				continue;
			}
			const variableType = declarations.find(
				(decl) => decl.name === match.key
			)?.type;
			if (variableType === "input-variable") {
				conditions.push(
					`${compileInputAccess(match.key)} == ${doubleQuote(match.value)}`
				);
			} else if (variableType === "local-variable") {
				conditions.push(`${match.key} == ${doubleQuote(match.value)}`);
			}
		}

		if (conditions.length === 0) continue;
		compiledVariants.push(
			`if (${conditions.join(" && ")}) return /** @type {LocalizedString} */ (${compiledPattern.code});`
		);
		if (compiledPartsPattern) {
			compiledPartsVariants.push(
				`if (${conditions.join(" && ")}) return /** @type {import('../runtime.js').MessagePart[]} */ (${compiledPartsPattern.code});`
			);
		}
	}

	const compiledLocalVariables = [];

	for (const declaration of declarations) {
		if (declaration.type === "local-variable") {
			compiledLocalVariables.push(
				compileLocalVariable({ declaration, locale: message.locale })
			);
		}
	}

	if (!hasMarkup) {
		const code = `/** @type {(inputs: ${messageInputType}) => LocalizedString} */ (${hasInputs ? "i" : ""}) => {${compiledLocalVariables.join("\n\t")}
	${compiledVariants.join("\n\t")}
	${hasCatchAll ? "" : `return /** @type {LocalizedString} */ ("${message.bundleId}");`}
};`;

		return { code, node: message };
	}

	const localVariablesCode = compiledLocalVariables.length
		? compiledLocalVariables.join("\n\t") + "\n\t"
		: "";
	const stringVariantsCode = compiledVariants.length
		? compiledVariants.join("\n\t") + "\n\t"
		: "";
	const partsVariantsCode = compiledPartsVariants.length
		? compiledPartsVariants.join("\n\t") + "\n\t"
		: "";
	const inputType = messageInputType;
	const fallbackParts = `[{ type: "text", value: ${JSON.stringify(message.bundleId)} }]`;
	const messageInput = hasInputs ? "i" : "";

	const code = `/** @type {((inputs: ${inputType}) => LocalizedString) & { parts: (inputs: ${inputType}) => import('../runtime.js').MessagePart[] }} */ (
	/* @__PURE__ */ Object.assign(
		/** @type {(inputs: ${inputType}) => LocalizedString} */ ((${messageInput}) => {
			${localVariablesCode}${stringVariantsCode}${
				hasCatchAll
					? ""
					: `return /** @type {LocalizedString} */ (${JSON.stringify(message.bundleId)});`
			}
		}),
		{
			parts: /** @type {(inputs: ${inputType}) => import('../runtime.js').MessagePart[]} */ ((${messageInput}) => {
				${localVariablesCode}${partsVariantsCode}${
					hasCatchAll
						? ""
						: `return /** @type {import('../runtime.js').MessagePart[]} */ (${fallbackParts});`
				}
			})
		}
	)
);`;

	return { code, node: message };
}

function patternHasMarkup(pattern: Pattern): boolean {
	return pattern.some(
		(part) =>
			part.type === "markup-start" ||
			part.type === "markup-end" ||
			part.type === "markup-standalone"
	);
}
