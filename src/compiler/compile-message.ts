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
	const declarationsByName = new Map(
		declarations.map((declaration) => [declaration.name, declaration])
	);
	const sortedVariants = [...variants]
		.map((variant, index) => ({ variant, index }))
		.sort((left, right) =>
			compareVariantSpecificity(
				left.variant,
				right.variant,
				message,
				declarationsByName
			) || left.index - right.index
		)
		.map((entry) => entry.variant);

	// TODO make sure that matchers use keys instead of indexes
	const compiledVariants = [];
	const compiledPartsVariants = [];

	let hasCatchAll = false;

	for (const variant of sortedVariants) {
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
			const condition = compileMatchCondition(match, declarationsByName);
			if (condition) {
				conditions.push(condition);
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

function compileMatchCondition(
	match: Variant["matches"][number],
	declarationsByName: Map<string, Declaration>
): string | undefined {
	if (match.type !== "literal-match") {
		return undefined;
	}

	const declaration = declarationsByName.get(match.key);
	if (!declaration) {
		return undefined;
	}

	if (declaration.type === "input-variable") {
		return `${compileInputAccess(match.key)} == ${doubleQuote(match.value)}`;
	}

	if (isPluralSelectorDeclaration(declaration) && isNumericLiteralKey(match.value)) {
		return `registry.numberExact(${compileSelectorOperand(declaration)}, ${doubleQuote(match.value)})`;
	}

	return `${match.key} == ${doubleQuote(match.value)}`;
}

function compareVariantSpecificity(
	left: Variant,
	right: Variant,
	message: Message,
	declarationsByName: Map<string, Declaration>
): number {
	for (const selector of message.selectors) {
		const leftScore = selectorMatchPriority(
			left.matches.find((match) => match.key === selector.name),
			declarationsByName.get(selector.name)
		);
		const rightScore = selectorMatchPriority(
			right.matches.find((match) => match.key === selector.name),
			declarationsByName.get(selector.name)
		);
		if (leftScore !== rightScore) {
			return leftScore - rightScore;
		}
	}

	return 0;
}

function selectorMatchPriority(
	match: Variant["matches"][number] | undefined,
	declaration: Declaration | undefined
): number {
	if (!match || match.type === "catchall-match") {
		return isPluralSelectorDeclaration(declaration) ? 2 : 1;
	}

	if (isPluralSelectorDeclaration(declaration) && isNumericLiteralKey(match.value)) {
		return 0;
	}

	return isPluralSelectorDeclaration(declaration) ? 1 : 0;
}

function isPluralSelectorDeclaration(
	declaration: Declaration | undefined
): declaration is Extract<Declaration, { type: "local-variable" }> {
	return (
		declaration?.type === "local-variable" &&
		declaration.value.annotation?.type === "function-reference" &&
		declaration.value.annotation.name === "plural"
	);
}

function compileSelectorOperand(
	declaration: Extract<Declaration, { type: "local-variable" }>
): string {
	if (declaration.value.arg.type === "variable-reference") {
		return compileInputAccess(declaration.value.arg.name);
	}

	return doubleQuote(declaration.value.arg.value);
}

function isNumericLiteralKey(value: string): boolean {
	return /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value);
}

function patternHasMarkup(pattern: Pattern): boolean {
	return pattern.some(
		(part) =>
			part.type === "markup-start" ||
			part.type === "markup-end" ||
			part.type === "markup-standalone"
	);
}
