import type {
	Declaration,
	LocalVariable,
	Message,
	Pattern,
	Variant,
} from "@inlang/sdk";
import { compilePattern } from "./compile-pattern.js";
import type { Compiled } from "./types.js";
import { inputsType, type InputMatchTypes } from "./jsdoc-types.js";
import { compileLocalVariable } from "./compile-local-variable.js";
import type { RegistryUsage } from "./compile-annotation.js";
import { renderInputMatchCondition } from "./match-literals.js";
import { compileInputAccess } from "./variable-access.js";
import { resolveInputAlias } from "./input-alias.js";
import {
	patternVariableReferences,
	resolveMessageLocals,
} from "./message-locals.js";

/**
 * The message fields the compiler reads.
 *
 * `selectBundleNested()` of `@inlang/sdk` 4 returns the bundle id as
 * `bundle_id` (the database column). The camelCase `bundleId` of the SDK's
 * plugin `Message` shape is accepted too.
 */
export type CompilableMessage = Pick<Message, "id" | "locale" | "selectors"> &
	({ bundleId: string } | { bundle_id: string });

/**
 * The variant fields the compiler reads. The message id (`message_id` in
 * `@inlang/sdk` 4 rows) is not needed.
 */
export type CompilableVariant = Pick<Variant, "id" | "matches" | "pattern">;

/**
 * The bundle id of a message with either SDK version.
 */
export function messageBundleId(message: CompilableMessage): string {
	const ids = message as { bundle_id?: string; bundleId?: string };
	const bundleId = ids.bundle_id ?? ids.bundleId;
	if (typeof bundleId !== "string") {
		throw new Error(
			`Message ${JSON.stringify(message.id)} (locale ${JSON.stringify(message.locale)}) has no bundle id`
		);
	}
	return bundleId;
}

export type CompiledMessage = Compiled<CompilableMessage> & {
	/**
	 * The registry functions the compiled code calls, e.g. `["plural"]`.
	 * The output imports the registry only if a message calls it.
	 */
	registryFunctions: string[];
};

/**
 * Returns the compiled message as a string
 *
 */
export const compileMessage = (
	declarations: Declaration[],
	message: CompilableMessage,
	variants: CompilableVariant[],
	matchTypes?: InputMatchTypes,
	inputTypeAliasName?: string
): CompiledMessage => {
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
	message: CompilableMessage,
	variants: CompilableVariant[],
	matchTypes?: InputMatchTypes,
	inputTypeAliasName?: string
): CompiledMessage {
	const variant = variants[0];
	if (!variant || variants.length !== 1) {
		throw new Error("Message must have exactly one variant");
	}

	const hasMarkup = patternHasMarkup(variant.pattern);
	const inputs = declarations.filter((decl) => decl.type === "input-variable");
	const registryUsage: RegistryUsage = new Set();
	const messageInputType = inputTypeAliasName ?? inputsType(inputs, matchTypes);
	// resolve before compiling the pattern to report undeclared variables
	// with the bundle id and locale
	const stringLocals = compileLocalVariables(
		patternVariableReferences(variant.pattern, "string"),
		declarations,
		message,
		registryUsage
	);
	const partsLocals = hasMarkup
		? compileLocalVariables(
				patternVariableReferences(variant.pattern, "parts"),
				declarations,
				message,
				registryUsage
			)
		: { code: [], readsInput: false };
	const compiledPattern = compilePattern({
		pattern: variant.pattern,
		declarations,
		locale: message.locale,
		registryUsage,
	});

	if (!hasMarkup) {
		const code = `/** @type {(inputs: ${messageInputType}) => LocalizedString} */ (${stringLocals.readsInput ? "i" : ""}) => {
	${stringLocals.code.join("\n\t")}return /** @type {LocalizedString} */ (${compiledPattern.code})
};`;

		return { code, node: message, registryFunctions: [...registryUsage] };
	}

	const compiledPartsPattern = compilePattern({
		pattern: variant.pattern,
		declarations,
		mode: "parts",
		locale: message.locale,
		registryUsage,
	});
	const localVariablesCode = joinLocalVariables(stringLocals.code);
	const partsLocalVariablesCode = joinLocalVariables(partsLocals.code);
	const inputType = messageInputType;
	// only declare the input parameter where it is read (noUnusedParameters)
	const messageInput = stringLocals.readsInput ? "i" : "";
	const partsMessageInput = partsLocals.readsInput ? "i" : "";

	const partsCode = `/** @type {((inputs: ${inputType}) => LocalizedString) & { parts: (inputs: ${inputType}) => import('../runtime.js').MessagePart[] }} */ (
	/* @__PURE__ */ Object.assign(
		/** @type {(inputs: ${inputType}) => LocalizedString} */ ((${messageInput}) => {
			${localVariablesCode}return /** @type {LocalizedString} */ (${compiledPattern.code})
		}),
		{
			parts: /** @type {(inputs: ${inputType}) => import('../runtime.js').MessagePart[]} */ ((${partsMessageInput}) => {
				${partsLocalVariablesCode}return /** @type {import('../runtime.js').MessagePart[]} */ (${compiledPartsPattern.code})
			})
		}
	)
);`;

	return {
		code: partsCode,
		node: message,
		registryFunctions: [...registryUsage],
	};
}

function compileMessageWithMultipleVariants(
	declarations: Declaration[],
	message: CompilableMessage,
	variants: CompilableVariant[],
	matchTypes?: InputMatchTypes,
	inputTypeAliasName?: string
): CompiledMessage {
	if (variants.length <= 1) {
		throw new Error("Message must have more than one variant");
	}

	const hasMarkup = variants.some((variant) =>
		patternHasMarkup(variant.pattern)
	);
	const inputs = declarations.filter((decl) => decl.type === "input-variable");
	const registryUsage: RegistryUsage = new Set();
	const messageInputType = inputTypeAliasName ?? inputsType(inputs, matchTypes);

	// The variants the function checks, in preference order. A variant without
	// a condition is a catchall and returns unconditionally.
	const steps: Array<{ pattern: Pattern; condition?: string }> = [];
	// variables the match conditions read
	const conditionReads: string[] = [];

	let hasCatchAll = false;

	for (const variant of sortVariantsBySelectorPreference(
		variants,
		message.selectors
	)) {
		const isCatchAll = variant.matches.every(
			(match) => match.type === "catchall-match"
		);

		if (isCatchAll) {
			steps.push({ pattern: variant.pattern });
			hasCatchAll = true;
			continue;
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
				conditionReads.push(match.key);
				conditions.push(
					renderInputMatchCondition(compileInputAccess(match.key), match.value)
				);
			} else if (variableType === "local-variable") {
				conditionReads.push(match.key);
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
		steps.push({
			pattern: variant.pattern,
			condition: conditions.join(" && "),
		});
	}

	// resolve before compiling the patterns to report undeclared variables
	// with the bundle id and locale
	const stringLocals = compileLocalVariables(
		[
			...conditionReads,
			...steps.flatMap((step) =>
				patternVariableReferences(step.pattern, "string")
			),
		],
		declarations,
		message,
		registryUsage
	);
	const partsLocals = hasMarkup
		? compileLocalVariables(
				[
					...conditionReads,
					...steps.flatMap((step) =>
						patternVariableReferences(step.pattern, "parts")
					),
				],
				declarations,
				message,
				registryUsage
			)
		: { code: [], readsInput: false };

	const compiledVariants: string[] = [];
	const compiledPartsVariants: string[] = [];

	for (const step of steps) {
		const compiledPattern = compilePattern({
			pattern: step.pattern,
			declarations,
			locale: message.locale,
			registryUsage,
		});
		compiledVariants.push(
			step.condition === undefined
				? `return /** @type {LocalizedString} */ (${compiledPattern.code})`
				: `if (${step.condition}) return /** @type {LocalizedString} */ (${compiledPattern.code});`
		);
		if (hasMarkup) {
			const compiledPartsPattern = compilePattern({
				pattern: step.pattern,
				declarations,
				mode: "parts",
				locale: message.locale,
				registryUsage,
			});
			compiledPartsVariants.push(
				step.condition === undefined
					? `return /** @type {import('../runtime.js').MessagePart[]} */ (${compiledPartsPattern.code})`
					: `if (${step.condition}) return /** @type {import('../runtime.js').MessagePart[]} */ (${compiledPartsPattern.code});`
			);
		}
	}

	if (!hasMarkup) {
		const code = `/** @type {(inputs: ${messageInputType}) => LocalizedString} */ (${stringLocals.readsInput ? "i" : ""}) => {${stringLocals.code.join("\n\t")}
	${compiledVariants.join("\n\t")}
	${hasCatchAll ? "" : `return /** @type {LocalizedString} */ (${JSON.stringify(messageBundleId(message))});`}
};`;

		return { code, node: message, registryFunctions: [...registryUsage] };
	}

	const localVariablesCode = joinLocalVariables(stringLocals.code);
	const partsLocalVariablesCode = joinLocalVariables(partsLocals.code);
	const stringVariantsCode = compiledVariants.length
		? compiledVariants.join("\n\t") + "\n\t"
		: "";
	const partsVariantsCode = compiledPartsVariants.length
		? compiledPartsVariants.join("\n\t") + "\n\t"
		: "";
	const inputType = messageInputType;
	const fallbackParts = `[{ type: "text", value: ${JSON.stringify(messageBundleId(message))} }]`;
	// only declare the input parameter where it is read (noUnusedParameters)
	const messageInput = stringLocals.readsInput ? "i" : "";
	const partsMessageInput = partsLocals.readsInput ? "i" : "";

	const code = `/** @type {((inputs: ${inputType}) => LocalizedString) & { parts: (inputs: ${inputType}) => import('../runtime.js').MessagePart[] }} */ (
	/* @__PURE__ */ Object.assign(
		/** @type {(inputs: ${inputType}) => LocalizedString} */ ((${messageInput}) => {
			${localVariablesCode}${stringVariantsCode}${
				hasCatchAll
					? ""
					: `return /** @type {LocalizedString} */ (${JSON.stringify(messageBundleId(message))});`
			}
		}),
		{
			parts: /** @type {(inputs: ${inputType}) => import('../runtime.js').MessagePart[]} */ ((${partsMessageInput}) => {
				${partsLocalVariablesCode}${partsVariantsCode}${
					hasCatchAll
						? ""
						: `return /** @type {import('../runtime.js').MessagePart[]} */ (${fallbackParts});`
				}
			})
		}
	)
);`;

	return { code, node: message, registryFunctions: [...registryUsage] };
}

/**
 * Compiles the local variables a message function reads, directly or through
 * other locals, in dependency order. Unread locals are left out. `readsInput`
 * tells whether the function reads its inputs parameter.
 */
function compileLocalVariables(
	reads: string[],
	declarations: Declaration[],
	message: CompilableMessage,
	registryUsage: RegistryUsage
): { code: string[]; readsInput: boolean } {
	const { locals, readsInput } = resolveMessageLocals({
		reads,
		declarations,
		bundleId: messageBundleId(message),
		locale: message.locale,
	});
	return {
		code: locals.map((declaration: LocalVariable) =>
			compileLocalVariable({
				declaration,
				declarations,
				locale: message.locale,
				registryUsage,
			})
		),
		readsInput,
	};
}

function joinLocalVariables(compiledLocalVariables: string[]): string {
	return compiledLocalVariables.length
		? compiledLocalVariables.join("\n\t") + "\n\t"
		: "";
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
function sortVariantsBySelectorPreference<V extends CompilableVariant>(
	variants: V[],
	selectors: Message["selectors"]
): V[] {
	if (selectors.length === 0) {
		return variants;
	}
	const rank = (variant: CompilableVariant) =>
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
