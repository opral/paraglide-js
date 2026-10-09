import type { Declaration, Message, Pattern, Variant } from "@inlang/sdk";
import { compilePattern } from "./compile-pattern.js";
import type { Compiled } from "./types.js";
import { inputsType, type InputMatchTypes } from "./jsdoc-types.js";
import { compileLocalVariable } from "./compile-local-variable.js";
import { renderInputMatchCondition } from "./match-literals.js";
import { compileInputAccess } from "./variable-access.js";
import { resolveInputAlias } from "./input-alias.js";

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
		locale: message.locale,
	});

	const compiledLocalVariables = [];

	for (const declaration of declarations) {
		if (declaration.type === "local-variable") {
			compiledLocalVariables.push(
				compileLocalVariable({
					declaration,
					declarations,
					locale: message.locale,
				})
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
		locale: message.locale,
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

	const hasMarkup = variants.some((variant) =>
		patternHasMarkup(variant.pattern)
	);
	const inputs = declarations.filter((decl) => decl.type === "input-variable");
	const hasInputs = inputs.length > 0;
	const messageInputType = inputTypeAliasName ?? inputsType(inputs, matchTypes);

	// TODO make sure that matchers use keys instead of indexes
	const compiledVariants = [];
	const compiledPartsVariants = [];

	let hasCatchAll = false;

	for (const variant of sortVariantsBySelectorPreference(
		variants,
		message.selectors
	)) {
		const compiledPattern = compilePattern({
			pattern: variant.pattern,
			declarations,
			locale: message.locale,
		});
		const compiledPartsPattern = hasMarkup
			? compilePattern({
					pattern: variant.pattern,
					declarations,
					mode: "parts",
					locale: message.locale,
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
					renderInputMatchCondition(compileInputAccess(match.key), match.value)
				);
			} else if (variableType === "local-variable") {
				// An un-annotated local that aliases an input holds the raw input
				// value (e.g. ICU `=0` imports as `.local countPluralExact = {$count}`)
				// and must match like the input itself, numerically for numbers.
				// Annotated locals hold the function's result and match as strings.
				conditions.push(
					resolveInputAlias(match.key, declarations) !== undefined
						? renderInputMatchCondition(match.key, match.value)
						: `${match.key} === ${JSON.stringify(match.value)}`
				);
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
				compileLocalVariable({
					declaration,
					declarations,
					locale: message.locale,
				})
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

/**
 * Orders variants by key preference in selector order, as in MessageFormat 2
 * variant selection: for the first selector, variants with a literal key come
 * before variants with a catchall key, then the next selector breaks ties, and
 * so on. Ties keep their original order.
 *
 * The compiled message returns the first variant whose conditions hold, so
 * this makes `countPluralExact=0 × countPlural=*` win over
 * `countPluralExact=* × countPlural=one` for French count 0 regardless of the
 * order the variants are stored in.
 */
function sortVariantsBySelectorPreference(
	variants: Variant[],
	selectors: Message["selectors"]
): Variant[] {
	if (selectors.length === 0) {
		return variants;
	}
	const rank = (variant: Variant) =>
		selectors.map((selector) =>
			variant.matches.some(
				(match) => match.key === selector.name && match.type === "literal-match"
			)
				? 0
				: 1
		);
	return variants
		.map((variant, index) => ({ variant, index, rank: rank(variant) }))
		.sort((left, right) => {
			for (let i = 0; i < selectors.length; i++) {
				const diff = left.rank[i]! - right.rank[i]!;
				if (diff !== 0) return diff;
			}
			return left.index - right.index;
		})
		.map((entry) => entry.variant);
}

function patternHasMarkup(pattern: Pattern): boolean {
	return pattern.some(
		(part) =>
			part.type === "markup-start" ||
			part.type === "markup-end" ||
			part.type === "markup-standalone"
	);
}
