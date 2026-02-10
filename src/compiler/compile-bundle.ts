import type {
	Bundle,
	BundleNested,
	MarkupStandalone,
	MarkupStart,
	Message,
	ProjectSettings,
} from "@inlang/sdk";
import { compileMessage } from "./compile-message.js";
import type { Compiled } from "./types.js";
import {
	inputTypeForName,
	jsDocBundleFunctionTypes,
	type InputMatchTypes,
} from "./jsdoc-types.js";
import { isValidIdentifier, quotePropertyKey } from "./variable-access.js";
import { toSafeModuleId } from "./safe-module-id.js";
import { escapeForDoubleQuoteString } from "../services/codegen/escape.js";

export type CompiledBundleWithMessages = {
	/** The compilation result for the bundle index */
	bundle: Compiled<Bundle>;
	/** The compilation results for the languages */
	messages: {
		[locale: string]: Compiled<Message>;
	};
	/** Match literal types inferred from bundle variants */
	matchTypes: InputMatchTypes;
	/** Shared typedef name for bundle input types used across emitted JSDoc */
	inputTypeAliasName?: string;
};

/**
 * Compiles all the messages in the bundle and returns an index-function + each compiled message
 */
export const compileBundle = (args: {
	bundle: BundleNested;
	fallbackMap: Record<string, string | undefined>;
	messageReferenceExpression: (locale: string, bundleId: string) => string;
	settings?: ProjectSettings;
	experimentalMiddlewareLocaleSplitting?: boolean;
}): CompiledBundleWithMessages => {
	const compiledMessages: Record<string, Compiled<Message>> = {};
	const safeBundleId = toSafeModuleId(args.bundle.id);
	const inputTypeAliasName = toBundleInputTypeAliasName(safeBundleId);
	const matchTypes = collectInputMatchTypes(args.bundle);
	const hasMarkup = bundleHasMarkup(args.bundle);

	for (const message of args.bundle.messages) {
		if (compiledMessages[message.locale]) {
			throw new Error(`Duplicate locale: ${message.locale}`);
		}

		const compiledMessage = compileMessage(
			args.bundle.declarations,
			message,
			message.variants,
			matchTypes,
			inputTypeAliasName
		);

		// set the pattern for the language tag
		compiledMessages[message.locale] = compiledMessage;
	}

	return {
		bundle: compileBundleFunction({
			bundle: args.bundle,
			availableLocales: Object.keys(args.fallbackMap),
			messageReferenceExpression: args.messageReferenceExpression,
			settings: args.settings,
			matchTypes,
			hasMarkup,
			experimentalMiddlewareLocaleSplitting:
				args.experimentalMiddlewareLocaleSplitting ?? false,
			inputTypeAliasName,
		}),
		messages: compiledMessages,
		matchTypes,
		inputTypeAliasName,
	};
};

const compileBundleFunction = (args: {
	/**
	 * The bundle to compile
	 */
	bundle: BundleNested;
	/**
	 * The language tags which are available
	 */
	availableLocales: string[];
	/**
	 * The message reference expression
	 */
	messageReferenceExpression: (locale: string, bundleId: string) => string;
	/**
	 * The project settings
	 */
	settings?: ProjectSettings;
	/**
	 * Match literal types inferred from bundle variants
	 */
	matchTypes: InputMatchTypes;
	/**
	 * Whether at least one variant in this bundle contains markup.
	 */
	hasMarkup: boolean;
	/**
	 * Whether middleware locale splitting runtime hooks should be emitted.
	 */
	experimentalMiddlewareLocaleSplitting: boolean;
	/**
	 * Shared typedef name for bundle input types used across emitted JSDoc.
	 */
	inputTypeAliasName: string;
}): Compiled<Bundle> => {
	const inputs = args.bundle.declarations.filter(
		(decl) => decl.type === "input-variable"
	);
	const hasInputs = inputs.length > 0;
	const safeBundleId = toSafeModuleId(args.bundle.id);

	const isSafeBundleId = safeBundleId === args.bundle.id;

	const isFullyTranslated =
		args.availableLocales.length === args.settings?.locales.length;

	const inputType = args.inputTypeAliasName;
	const localesUnion =
		args.availableLocales.length === 0
			? "never"
			: args.availableLocales.map((locale) => `"${locale}"`).join(" | ");
	const optionsType = `{ locale?: ${localesUnion} }`;
	const inputsParameterType = `${hasInputs ? "inputs" : "inputs?"}: ${inputType}`;
	const bundleFunctionType = `(${inputsParameterType}, options?: ${optionsType}) => LocalizedString`;
	const partsFunctionType = `(${inputsParameterType}, options?: ${optionsType}) => import('../runtime.js').MessagePart[]`;
	const markupSchemaType = buildMarkupSchemaType(args.bundle, args.matchTypes);
	const messageMetadataType = `import('../runtime.js').MessageMetadata<${inputType}, ${optionsType}, ${markupSchemaType}>`;

	const compileLocaleReturnStatements = (
		mode: "string" | "parts",
		continuationIndent: string
	): string =>
		args.availableLocales
			.map((locale, index) => {
				const condition =
					!isFullyTranslated || index < args.availableLocales.length - 1
						? `if (locale === "${locale}") `
						: "";
				const prefix = index > 0 ? continuationIndent : "";
				const messageRef = args.messageReferenceExpression(
					locale,
					args.bundle.id
				);

				if (mode === "string") {
					return `${prefix}${condition}return ${messageRef}(inputs)`;
				}

				return `${prefix}${condition}return typeof ${messageRef}.parts === "function" ? ${messageRef}.parts(inputs) : [{ type: "text", value: ${messageRef}(inputs) }]`;
			})
			.join("\n");

	const englishMatchTableDoc = buildEnglishMatchTableDoc(args.bundle);

	const commonJsDoc = `/**
${englishMatchTableDoc}${jsDocBundleFunctionTypes({
		inputs,
		locales: args.availableLocales,
		matchTypes: args.matchTypes,
		inputTypeOverride: args.inputTypeAliasName,
	})}
*/`;

	const clientMiddlewareGuard = (indent: string): string => {
		if (!args.experimentalMiddlewareLocaleSplitting) {
			return "";
		}

		return `\n${indent}if (experimentalMiddlewareLocaleSplitting && isServer === false) {\n${indent}\treturn /** @type {any} */ (globalThis).__paraglide_ssr.${safeBundleId}(inputs)\n${indent}}`;
	};

	const clientPartsMiddlewareGuard = (indent: string): string => {
		if (!args.experimentalMiddlewareLocaleSplitting) {
			return "";
		}

		return `\n${indent}if (experimentalMiddlewareLocaleSplitting && isServer === false) {\n${indent}\tconst serverMessage = /** @type {any} */ (globalThis).__paraglide_ssr.${safeBundleId}\n${indent}\tif (typeof serverMessage.parts === "function") {\n${indent}\t\treturn /** @type {import('../runtime.js').MessagePart[]} */ (serverMessage.parts(inputs))\n${indent}\t}\n${indent}\treturn /** @type {import('../runtime.js').MessagePart[]} */ ([{ type: "text", value: serverMessage(inputs) }])\n${indent}}`;
	};

	const maybeTrackMessageCall = (indent: string): string => {
		if (!args.experimentalMiddlewareLocaleSplitting) {
			return "";
		}

		return `\n${indent}trackMessageCall("${safeBundleId}", locale)`;
	};

	let code = "";

	if (!args.hasMarkup) {
		code = `${commonJsDoc}
${isSafeBundleId ? "export " : ""}const ${safeBundleId} = /** @type {(${bundleFunctionType}) & ${messageMetadataType}} */ ((inputs${hasInputs ? "" : " = {}"}, options = {}) => {${clientMiddlewareGuard(
			"\t"
		)}
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()${maybeTrackMessageCall(
		"\t"
	)}
	${compileLocaleReturnStatements("string", "\t")}${
		!isFullyTranslated
			? `\n	return /** @type {LocalizedString} */ ("${args.bundle.id}")`
			: ""
	}
});`;
	} else {
		code = `${commonJsDoc}
${isSafeBundleId ? "export " : ""}const ${safeBundleId} = /** @type {(${bundleFunctionType}) & { parts: ${partsFunctionType} } & ${messageMetadataType}} */ (
	/* @__PURE__ */ Object.assign(
		/** @type {${bundleFunctionType}} */ ((inputs${hasInputs ? "" : " = {}"}, options = {}) => {${clientMiddlewareGuard(
			"\t\t\t"
		)}
			const locale = experimentalStaticLocale ?? options.locale ?? getLocale()${maybeTrackMessageCall(
				"\t\t\t"
			)}
			${compileLocaleReturnStatements("string", "\t\t\t")}${
				!isFullyTranslated
					? `\n			return /** @type {LocalizedString} */ (${JSON.stringify(args.bundle.id)})`
					: ""
			}
		}),
		{
			parts: /** @type {${partsFunctionType}} */ ((inputs${
				hasInputs ? "" : " = {}"
			}, options = {}) => {${clientPartsMiddlewareGuard("\t\t\t\t")}
				const locale = experimentalStaticLocale ?? options.locale ?? getLocale()${maybeTrackMessageCall(
					"\t\t\t\t"
				)}
				${compileLocaleReturnStatements("parts", "\t\t\t\t")}${
					!isFullyTranslated
						? `\n				return /** @type {import('../runtime.js').MessagePart[]} */ ([{ type: "text", value: ${JSON.stringify(args.bundle.id)} }])`
						: ""
				}
			})
		}
	)
);`;
	}

	if (isSafeBundleId === false) {
		code += `\nexport { ${safeBundleId} as "${escapeForDoubleQuoteString(args.bundle.id)}" }`;
	}

	return {
		code,
		node: args.bundle,
	};
};

function buildEnglishMatchTableDoc(bundle: BundleNested): string {
	const message = selectEnglishMessage(bundle);
	if (!message) {
		return "";
	}

	const selectorKeys = collectSelectorKeys(message);
	const headerCells = [...selectorKeys, "output"];
	const lines = [
		`* | ${headerCells.map(escapeTableCell).join(" | ")} |`,
		`* | ${headerCells.map(() => "---").join(" | ")} |`,
	];

	for (const variant of message.variants) {
		const rowValues = selectorKeys.map((key) => getMatchCellValue(variant, key));
		const serializedOutput = serializePatternPreview(variant.pattern);
		const outputValue = JSON.stringify(
			serializedOutput.length > 160
				? `${serializedOutput.slice(0, 157)}...`
				: serializedOutput
		);
		lines.push(
			`* | ${[...rowValues, outputValue].map(escapeTableCell).join(" | ")} |`
		);
	}

	lines.push("*");

	return lines.join("\n");
}

function selectEnglishMessage(
	bundle: BundleNested
): BundleNested["messages"][number] | undefined {
	return (
		bundle.messages.find((message) => message.locale === "en") ??
		bundle.messages.find((message) => message.locale.startsWith("en-"))
	);
}

function collectSelectorKeys(message: BundleNested["messages"][number]): string[] {
	const keys: string[] = [];
	const seen = new Set<string>();

	for (const variant of message.variants) {
		for (const match of variant.matches ?? []) {
			if (seen.has(match.key)) continue;
			seen.add(match.key);
			keys.push(match.key);
		}
	}

	return keys;
}

function getMatchCellValue(
	variant: BundleNested["messages"][number]["variants"][number],
	key: string
): string {
	const match = (variant.matches ?? []).find((entry) => entry.key === key);
	if (!match || match.type === "catchall-match") {
		return "*";
	}

	return JSON.stringify(match.value);
}

function escapeTableCell(value: string): string {
	return value
		.replace(/\|/g, "\\|")
		.replace(/\r?\n/g, " ")
		.replaceAll("*/", "*\\/");
}

export function toBundleInputTypeAliasName(safeBundleId: string): string {
	return `${toBundleTypeBaseName(safeBundleId)}Inputs`;
}

function toBundleTypeBaseName(safeBundleId: string): string {
	const segments = safeBundleId
		.split("_")
		.filter(Boolean)
		.map((segment) => segment[0]?.toUpperCase() + segment.slice(1));
	let baseName = segments.join("");

	if (!baseName) {
		baseName = "Message";
	}

	if (!/^[A-Za-z]/.test(baseName)) {
		baseName = `Message${baseName}`;
	}

	return baseName;
}

function serializePatternPreview(
	pattern: BundleNested["messages"][number]["variants"][number]["pattern"]
): string {
	let result = "";

	for (const part of pattern) {
		if (part.type === "text") {
			result += part.value;
			continue;
		}

		if (part.type === "expression") {
			if (part.arg.type === "literal") {
				result += part.arg.value;
			} else {
				result += `{${part.arg.name}}`;
			}
		}
	}

	return result.replace(/\s+/g, " ").trim();
}

type MarkupValueAccumulator = {
	count: number;
	types: Set<string>;
};

type MarkupTagAccumulator = {
	occurrences: number;
	childrenTrue: boolean;
	childrenFalse: boolean;
	options: Map<string, MarkupValueAccumulator>;
	attributes: Map<string, MarkupValueAccumulator>;
};

function buildMarkupSchemaType(
	bundle: BundleNested,
	matchTypes: InputMatchTypes
): string {
	const tagAccumulators = new Map<string, MarkupTagAccumulator>();
	const inputVariableNames = new Set(
		bundle.declarations
			.filter((declaration) => declaration.type === "input-variable")
			.map((declaration) => declaration.name)
	);

	for (const message of bundle.messages) {
		for (const variant of message.variants) {
			for (const part of variant.pattern) {
				if (part.type !== "markup-start" && part.type !== "markup-standalone") {
					continue;
				}

				const tag = ensureMarkupTagAccumulator(tagAccumulators, part.name);
				tag.occurrences += 1;
				if (part.type === "markup-start") {
					tag.childrenTrue = true;
				} else {
					tag.childrenFalse = true;
				}

				collectMarkupOptions(tag, part, inputVariableNames, matchTypes);
				collectMarkupAttributes(tag, part);
			}
		}
	}

	if (tagAccumulators.size === 0) {
		return "{}";
	}

	const tagEntries = Array.from(tagAccumulators.entries())
		.sort(([leftName], [rightName]) => leftName.localeCompare(rightName))
		.map(
			([tagName, tag]) =>
				`${renderTypeObjectKey(tagName)}: ${renderMarkupTagType(tag)}`
		);

	return `{ ${tagEntries.join("; ")} }`;
}

function ensureMarkupTagAccumulator(
	accumulators: Map<string, MarkupTagAccumulator>,
	tagName: string
): MarkupTagAccumulator {
	const existing = accumulators.get(tagName);
	if (existing) {
		return existing;
	}
	const created: MarkupTagAccumulator = {
		occurrences: 0,
		childrenTrue: false,
		childrenFalse: false,
		options: new Map(),
		attributes: new Map(),
	};
	accumulators.set(tagName, created);
	return created;
}

function collectMarkupOptions(
	tag: MarkupTagAccumulator,
	part: MarkupStart | MarkupStandalone,
	inputVariableNames: Set<string>,
	matchTypes: InputMatchTypes
): void {
	const seenOptions = new Set<string>();

	for (const option of part.options ?? []) {
		const optionAccumulator = ensureMarkupValueAccumulator(
			tag.options,
			option.name
		);
		optionAccumulator.types.add(
			resolveMarkupOptionType(option.value, inputVariableNames, matchTypes)
		);
		if (!seenOptions.has(option.name)) {
			optionAccumulator.count += 1;
			seenOptions.add(option.name);
		}
	}
}

function collectMarkupAttributes(
	tag: MarkupTagAccumulator,
	part: MarkupStart | MarkupStandalone
): void {
	const seenAttributes = new Set<string>();

	for (const attribute of part.attributes ?? []) {
		const attributeAccumulator = ensureMarkupValueAccumulator(
			tag.attributes,
			attribute.name
		);
		attributeAccumulator.types.add(
			attribute.value === true ? "true" : "string"
		);
		if (!seenAttributes.has(attribute.name)) {
			attributeAccumulator.count += 1;
			seenAttributes.add(attribute.name);
		}
	}
}

function resolveMarkupOptionType(
	value:
		| {
				type: "literal";
				value: string;
		  }
		| {
				type: "variable-reference";
				name: string;
		  },
	inputVariableNames: Set<string>,
	matchTypes: InputMatchTypes
): string {
	if (value.type === "literal") {
		return "string";
	}

	if (inputVariableNames.has(value.name)) {
		return inputTypeForName(value.name, matchTypes);
	}

	return "NonNullable<unknown>";
}

function ensureMarkupValueAccumulator(
	values: Map<string, MarkupValueAccumulator>,
	name: string
): MarkupValueAccumulator {
	const existing = values.get(name);
	if (existing) {
		return existing;
	}

	const created: MarkupValueAccumulator = { count: 0, types: new Set() };
	values.set(name, created);
	return created;
}

function renderMarkupTagType(tag: MarkupTagAccumulator): string {
	return `{ options: ${renderMarkupObjectType(tag.options, tag.occurrences)}; attributes: ${renderMarkupObjectType(tag.attributes, tag.occurrences)}; children: ${renderChildrenType(tag)} }`;
}

function renderMarkupObjectType(
	values: Map<string, MarkupValueAccumulator>,
	occurrenceCount: number
): string {
	if (values.size === 0) {
		return "{}";
	}

	const properties = Array.from(values.entries())
		.sort(([leftName], [rightName]) => leftName.localeCompare(rightName))
		.map(([name, value]) => {
			const isOptional = value.count < occurrenceCount;
			return `${renderTypeObjectKey(name)}${isOptional ? "?" : ""}: ${renderTypeUnion(value.types)}`;
		});

	return `{ ${properties.join("; ")} }`;
}

function renderChildrenType(tag: MarkupTagAccumulator): string {
	if (tag.childrenTrue && tag.childrenFalse) {
		return "boolean";
	}
	if (tag.childrenTrue) {
		return "true";
	}
	if (tag.childrenFalse) {
		return "false";
	}
	return "boolean";
}

function renderTypeUnion(types: Set<string>): string {
	const sorted = Array.from(types).sort();
	if (sorted.length === 0) {
		return "never";
	}
	if (sorted.length === 1) {
		return sorted[0] ?? "never";
	}
	return sorted.join(" | ");
}

function renderTypeObjectKey(name: string): string {
	return isValidIdentifier(name) ? name : quotePropertyKey(name);
}

function collectInputMatchTypes(bundle: BundleNested): InputMatchTypes {
	const inputNames = new Set(
		bundle.declarations
			?.filter((decl) => decl.type === "input-variable")
			.map((decl) => decl.name) ?? []
	);
	const matchTypes: InputMatchTypes = new Map();

	const ensureInfo = (name: string) => {
		const existing = matchTypes.get(name);
		if (existing) return existing;
		const created = { literals: new Set<string>(), hasCatchAll: false };
		matchTypes.set(name, created);
		return created;
	};

	for (const message of bundle.messages) {
		for (const variant of message.variants) {
			if (!variant.matches || variant.matches.length === 0) {
				for (const name of inputNames) {
					const info = ensureInfo(name);
					info.hasCatchAll = true;
				}
				continue;
			}
			for (const match of variant.matches ?? []) {
				if (!inputNames.has(match.key)) continue;
				const info = ensureInfo(match.key);
				if (match.type === "catchall-match") {
					info.hasCatchAll = true;
					continue;
				}
				if (match.type === "literal-match") {
					info.literals.add(match.value);
				}
			}
		}
	}

	return matchTypes;
}

function bundleHasMarkup(bundle: BundleNested): boolean {
	return bundle.messages.some((message) =>
		message.variants.some((variant) =>
			variant.pattern.some(
				(part) =>
					part.type === "markup-start" ||
					part.type === "markup-end" ||
					part.type === "markup-standalone"
			)
		)
	);
}
