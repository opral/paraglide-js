import type {
	Bundle,
	BundleNested,
	MarkupStandalone,
	MarkupStart,
	ProjectSettings,
} from "@inlang/sdk";
import {
	compileMessage,
	messageBundleId,
	type CompiledMessage,
} from "./compile-message.js";
import { compilePattern } from "./compile-pattern.js";
import type { Compiled } from "./types.js";
import {
	inputTypeForName,
	jsDocBundleFunctionTypes,
	type InputMatchTypes,
} from "./jsdoc-types.js";
import { isValidIdentifier, quotePropertyKey } from "./variable-access.js";
import { toSafeModuleId } from "./safe-module-id.js";
import { escapeForDoubleQuoteString } from "../services/codegen/escape.js";
import type { CompilerOptions } from "./compiler-options.js";
import { perLocaleBuildStaticLocaleExpression } from "./per-locale-build.js";
import { resolveInputAlias } from "./input-alias.js";

type InlineBody = NonNullable<CompiledMessage["inline"]>;

export type CompiledBundleWithMessages = {
	/** The compilation result for the bundle index */
	bundle: Compiled<Bundle>;
	/** The compilation results for the languages */
	messages: {
		[locale: string]: CompiledMessage;
	};
	/** Match literal types inferred from bundle variants */
	matchTypes: InputMatchTypes;
	/** Shared typedef name for bundle input types used across emitted JSDoc */
	inputTypeAliasName?: string;
	/** Compiled message helpers with no emitted reference in message-modules. */
	unreferencedMessageLocales?: string[];
	usesSharedFactory?: boolean;
	/** The dispatcher reads the development-only diagnostic flag. */
	usesDevelopmentDiagnostics?: boolean;
	englishMatchTableDoc?: string;
};

/**
 * Compiles all the messages in the bundle and returns an index-function + each compiled message
 */
export const compileBundle = (args: {
	bundle: BundleNested;
	fallbackMap: Record<string, string | undefined>;
	messageReferenceExpression: (locale: string, bundleId: string) => string;
	settings?: ProjectSettings;
	/** Internal layout control; locale modules keep text grouped by language. */
	inlineMessages?: boolean;
	/** Internal: shard wrappers export their returned message functions. */
	exported?: boolean;
	/** Internal: compile only bodies whose locale helper will never be emitted. */
	fuseInlineMessages?: boolean;
	/** Internal: grouped modules share their function and option typedefs. */
	compactTypes?: boolean;
	sharedMessageFactory?: boolean;
	experimentalStaticLocale?: CompilerOptions["experimentalStaticLocale"];
}): CompiledBundleWithMessages => {
	const fused = args.fuseInlineMessages && tryCompileInlineBundle(args);
	if (fused) return fused;
	const compiledMessages: Record<string, CompiledMessage> = {};
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
	const inlineMessages = args.inlineMessages === true;
	const inlinePlainTextByLocale = inlineMessages
		? findPlainTextMessages(args.bundle)
		: undefined;
	const inlineCandidates = inlineMessages
		? findInlineBodies(compiledMessages, inlinePlainTextByLocale ?? {})
		: {};
	const unreferencedMessageLocales = findUnreferencedMessageLocales({
		inlinedLocales: [
			...Object.keys(inlinePlainTextByLocale ?? {}),
			...Object.keys(inlineCandidates),
		],
		compiledMessages,
		fallbackMap: args.fallbackMap,
		hasMarkup,
	});
	// A fallback target stays a message function that the missing-locale alias
	// calls, so its dispatcher branch calls it too instead of repeating the body.
	const inlineBodiesByLocale = Object.create(null) as Record<
		string,
		InlineBody
	>;
	for (const locale of unreferencedMessageLocales) {
		const body = inlineCandidates[locale];
		if (body) inlineBodiesByLocale[locale] = body;
	}

	return {
		bundle: compileBundleFunction({
			bundle: args.bundle,
			availableLocales: Object.keys(args.fallbackMap),
			messageReferenceExpression: args.messageReferenceExpression,
			inlinePlainTextByLocale,
			inlineBodiesByLocale,
			settings: args.settings,
			matchTypes,
			hasMarkup,
			experimentalStaticLocale: args.experimentalStaticLocale,
			inputTypeAliasName,
			exported: args.exported,
			compactTypes: args.compactTypes,
		}),
		messages: compiledMessages,
		usesDevelopmentDiagnostics:
			args.experimentalStaticLocale === perLocaleBuildStaticLocaleExpression,
		matchTypes,
		inputTypeAliasName,
		unreferencedMessageLocales,
	};
};

/**
 * Fully translated, unformatted single-variant messages need no retained helper.
 * Fuse pattern compilation and inline metadata instead of constructing helper
 * functions and traversing the same patterns again to discard those functions.
 * Every other message uses the general compiler, including its diagnostics.
 */
function tryCompileInlineBundle(
	args: Parameters<typeof compileBundle>[0]
): CompiledBundleWithMessages | undefined {
	if (
		!args.inlineMessages ||
		!args.settings ||
		args.experimentalStaticLocale === perLocaleBuildStaticLocaleExpression
	)
		return;
	if (args.bundle.declarations.some((d) => d.type !== "input-variable")) return;
	const locales = Object.keys(args.fallbackMap);
	if (locales.length === 0 || args.bundle.messages.length !== locales.length)
		return;
	const seen = new Set<string>();
	const declared =
		args.bundle.declarations.length > 1
			? new Set(args.bundle.declarations.map((d) => d.name))
			: undefined;
	const singleInput = args.bundle.declarations[0]?.name;
	for (const message of args.bundle.messages) {
		// Keep the public catalog entry point's missing-reference diagnostic.
		messageBundleId(message);
		if (
			seen.has(message.locale) ||
			!Object.hasOwn(args.fallbackMap, message.locale) ||
			message.variants.length !== 1 ||
			message.selectors.length
		)
			return;
		seen.add(message.locale);
		const variant = message.variants[0]!;
		if (variant.matches.length) return;
		for (const part of variant.pattern) {
			if (part.type === "text") continue;
			if (
				part.type !== "expression" ||
				part.annotation ||
				(part.arg.type === "variable-reference" &&
					(declared
						? !declared.has(part.arg.name)
						: part.arg.name !== singleInput))
			)
				return;
		}
	}
	const inputTypeAliasName = toBundleInputTypeAliasName(
		toSafeModuleId(args.bundle.id)
	);
	const matchTypes: InputMatchTypes = new Map();
	const messages: Record<string, CompiledMessage> = {};
	const expressions: Record<string, string> = Object.create(null);
	const plain: Record<string, string> | undefined = args.sharedMessageFactory
		? undefined
		: Object.create(null);
	const bodies: Record<string, InlineBody> | undefined =
		args.sharedMessageFactory ? undefined : Object.create(null);
	for (const message of args.bundle.messages) {
		const pattern = message.variants[0]!.pattern;
		const compiled = compilePattern({
			pattern,
			declarations: args.bundle.declarations,
			locale: message.locale,
		});
		const readsInput = pattern.some(
			(p) => p.type === "expression" && p.arg.type === "variable-reference"
		);
		if (args.sharedMessageFactory) {
			expressions[message.locale] =
				`${readsInput ? "i" : "()"} => /** @type {LocalizedString} */ (${compiled.code})`;
			continue;
		}
		const plainText = pattern.every((p) => p.type === "text")
			? pattern
					.map((p) => (p.type === "text" ? p.value : ""))
					.join("")
					.replace(/\r\n?/g, "\n")
			: undefined;
		const inline = {
			statements: [`return /** @type {LocalizedString} */ (${compiled.code})`],
			readsInput,
		};
		messages[message.locale] = {
			node: message,
			code: "",
			registryFunctions: [],
			inline,
		};
		if (plainText !== undefined) plain![message.locale] = plainText;
		else bodies![message.locale] = inline;
	}
	const englishMatchTableDoc = args.sharedMessageFactory
		? buildEnglishMatchTableDoc(args.bundle)
		: undefined;
	const compiledBundle = args.sharedMessageFactory
		? {
				node: args.bundle,
				code: `${englishMatchTableDoc ? `/**\n${englishMatchTableDoc}*/\n` : ""}const ${toSafeModuleId(args.bundle.id)} = /** @type {${args.bundle.declarations.length ? "__ParaglideMessage" : "__ParaglideOptionalMessage"}<${inputTypeAliasName}>} */ (/* @__PURE__ */ ${args.bundle.declarations.length ? "__paraglideMessage" : "__paraglideOptionalMessage"}(${JSON.stringify(toSafeModuleId(args.bundle.id))}, ${locales
					.map((locale) => expressions[locale])
					.join(", ")}));`,
			}
		: compileBundleFunction({
				bundle: args.bundle,
				availableLocales: locales,
				messageReferenceExpression: args.messageReferenceExpression,
				inlinePlainTextByLocale: plain,
				inlineBodiesByLocale: bodies,
				settings: args.settings,
				matchTypes,
				hasMarkup: false,
				experimentalStaticLocale: args.experimentalStaticLocale,
				inputTypeAliasName,
				exported: args.exported,
				compactTypes: args.compactTypes,
			});
	return {
		bundle: compiledBundle,
		usesSharedFactory: args.sharedMessageFactory,
		usesDevelopmentDiagnostics:
			args.experimentalStaticLocale === perLocaleBuildStaticLocaleExpression,
		englishMatchTableDoc,
		messages,
		matchTypes,
		inputTypeAliasName,
		unreferencedMessageLocales: Object.keys(messages),
	};
}

/**
 * Finds one-variant messages whose pattern is entirely static text. Their
 * dispatcher branch can return the string directly without retaining a
 * locale message function in the client bundle.
 */
function findPlainTextMessages(bundle: BundleNested): Record<string, string> {
	const result = Object.create(null) as Record<string, string>;

	for (const message of bundle.messages) {
		if (message.variants.length !== 1) continue;
		const variant = message.variants[0];
		if (!variant || !variant.pattern.every((part) => part.type === "text")) {
			continue;
		}

		// compilePattern emits static text inside a template literal, whose
		// cooked value normalizes CR and CRLF line endings to LF.
		result[message.locale] = variant.pattern
			.map((part) => (part.type === "text" ? part.value : ""))
			.join("")
			.replace(/\r\n?/g, "\n");
	}

	return result;
}

/**
 * Finds the messages with inputs whose function body the dispatcher can run
 * in place of calling the message function. Markup messages keep their `.parts`
 * function, and messages that are plain text are returned as a string instead.
 */
function findInlineBodies(
	compiledMessages: Record<string, CompiledMessage>,
	inlinePlainTextByLocale: Record<string, string>
): Record<string, InlineBody> {
	const result = Object.create(null) as Record<string, InlineBody>;

	for (const [locale, message] of Object.entries(compiledMessages)) {
		if (message.inline && inlinePlainTextByLocale[locale] === undefined) {
			result[locale] = message.inline;
		}
	}

	return result;
}

function findUnreferencedMessageLocales(args: {
	inlinedLocales: string[];
	compiledMessages: Record<string, CompiledMessage>;
	fallbackMap: Record<string, string | undefined>;
	hasMarkup: boolean;
}): string[] {
	if (args.hasMarkup) return [];

	// Missing-locale aliases still call the first available compiled fallback
	// function, even when the dispatcher's own branch uses an inline string.
	const fallbackTargets = new Set<string>();
	for (const locale of Object.keys(args.fallbackMap)) {
		if (Object.hasOwn(args.compiledMessages, locale)) continue;

		let fallbackLocale = args.fallbackMap[locale];
		const visited = new Set([locale]);
		while (fallbackLocale && !visited.has(fallbackLocale)) {
			visited.add(fallbackLocale);
			if (Object.hasOwn(args.compiledMessages, fallbackLocale)) {
				fallbackTargets.add(fallbackLocale);
				break;
			}
			fallbackLocale = args.fallbackMap[fallbackLocale];
		}
	}

	return args.inlinedLocales.filter((locale) => !fallbackTargets.has(locale));
}

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
	/** Static text messages that can be returned directly from the dispatcher. */
	inlinePlainTextByLocale?: Record<string, string>;
	/** Message function bodies that the dispatcher runs in place of a call. */
	inlineBodiesByLocale?: Record<string, InlineBody>;
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
	 * Static locale expression emitted inside the message function so a
	 * bundler can tree-shake unselected locale modules.
	 */
	experimentalStaticLocale?: CompilerOptions["experimentalStaticLocale"];
	/**
	 * Shared typedef name for bundle input types used across emitted JSDoc.
	 */
	inputTypeAliasName: string;
	exported?: boolean;
	compactTypes?: boolean;
}): Compiled<Bundle> => {
	const inputs = args.bundle.declarations.filter(
		(decl) => decl.type === "input-variable"
	);
	const hasInputs = inputs.length > 0;
	const safeBundleId = toSafeModuleId(args.bundle.id);

	const isSafeBundleId = safeBundleId === args.bundle.id;

	const isFullyTranslated =
		args.availableLocales.length === args.settings?.locales.length;
	const baseLocale = args.settings?.baseLocale;
	const dispatchLocales =
		baseLocale && args.availableLocales.includes(baseLocale)
			? [
					...args.availableLocales.filter((locale) => locale !== baseLocale),
					baseLocale,
				]
			: args.availableLocales;
	// Inlined bodies read their inputs as `i`.
	const inputsName = Object.keys(args.inlineBodiesByLocale ?? {}).length
		? "i"
		: "inputs";
	const anyBranchReadsInputs = dispatchLocales.some((locale) => {
		if (args.inlinePlainTextByLocale?.[locale] !== undefined) return false;
		return args.inlineBodiesByLocale?.[locale]?.readsInput ?? true;
	});

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
		dispatchLocales
			.map((locale, index) => {
				const condition =
					!isFullyTranslated || index < dispatchLocales.length - 1
						? `if (locale === "${locale}") `
						: "";
				const prefix = index > 0 ? continuationIndent : "";
				const messageRef = args.messageReferenceExpression(
					locale,
					args.bundle.id
				);

				if (mode === "string") {
					const inlineText = args.inlinePlainTextByLocale?.[locale];
					if (inlineText !== undefined) {
						return `${prefix}${condition}return /** @type {LocalizedString} */ (${JSON.stringify(inlineText)})`;
					}
					const inlineBody = args.inlineBodiesByLocale?.[locale];
					if (inlineBody) {
						const [onlyStatement] = inlineBody.statements;
						return inlineBody.statements.length === 1 &&
							onlyStatement?.startsWith("return ")
							? `${prefix}${condition}${onlyStatement}`
							: `${prefix}${condition}{\n${continuationIndent}\t${inlineBody.statements.join(`\n${continuationIndent}\t`)}\n${continuationIndent}}`;
					}
					return `${prefix}${condition}return ${messageRef}(${inputsName})`;
				}

				// A locale's message has .parts() only if its own variants have
				// markup. Fallbacks and messages without markup are typed without
				// it, so read it through a type that declares it optional.
				return `${prefix}${condition}return /** @type {{ parts?: (inputs: ${inputType}) => import('../runtime.js').MessagePart[] }} */ (${messageRef}).parts?.(inputs) ?? [{ type: "text", value: ${messageRef}(inputs) }]`;
			})
			.join("\n");

	const perLocaleBuild =
		args.experimentalStaticLocale === perLocaleBuildStaticLocaleExpression;
	// A locale-specialized graph may ship source maps. Keeping the English
	// pattern preview in the shared dispatcher would leak base-locale message
	// text into every locale's map even after the English module is tree-shaken.
	const englishMatchTableDoc = perLocaleBuild
		? ""
		: buildEnglishMatchTableDoc(args.bundle);

	const compactTypes = args.compactTypes === true && !args.hasMarkup;
	const commonJsDoc = compactTypes
		? `/**\n${englishMatchTableDoc}*/`
		: `/**
${englishMatchTableDoc}${jsDocBundleFunctionTypes({
				inputs,
				locales: args.availableLocales,
				matchTypes: args.matchTypes,
				inputTypeOverride: args.inputTypeAliasName,
			})}
*/`;
	const stringFunctionType = compactTypes
		? `${hasInputs ? "__ParaglideMessage" : "__ParaglideOptionalMessage"}<${inputType}>`
		: `(${bundleFunctionType}) & ${messageMetadataType}`;

	const localeResolutionStatement = (indent: string): string => {
		const localeExpression = perLocaleBuild
			? `${perLocaleBuildStaticLocaleExpression} ?? options.locale ?? getLocale()`
			: "experimentalStaticLocale ?? options.locale ?? getLocale()";
		const overrideWarning = perLocaleBuild
			? `\n${indent}if (isDevelopment && ${perLocaleBuildStaticLocaleExpression} !== undefined && options.locale !== undefined && options.locale !== ${perLocaleBuildStaticLocaleExpression}) console.warn("Paraglide: options.locale cannot override a locale-specialized client bundle; use a full document navigation to switch locales.")`
			: "";

		if (isFullyTranslated && args.availableLocales.length === 1) {
			return `${indent}${localeExpression}${overrideWarning}`;
		}

		return `${indent}const locale = ${localeExpression}${overrideWarning}`;
	};
	const keepUnusedInputsParameter = (indent: string): string =>
		!anyBranchReadsInputs ? `\n${indent}void ${inputsName};` : "";

	let code = "";

	if (!args.hasMarkup) {
		code = `${commonJsDoc}
${args.exported !== false && isSafeBundleId ? "export " : ""}const ${safeBundleId} = /** @type {${stringFunctionType}} */ ((${inputsName}${hasInputs ? "" : " = {}"}, options = {}) => {${keepUnusedInputsParameter("\t")}
${localeResolutionStatement("\t")}
	${compileLocaleReturnStatements("string", "\t")}${
		!isFullyTranslated
			? `\n	return /** @type {LocalizedString} */ (${JSON.stringify(args.bundle.id)})`
			: ""
	}
});`;
	} else {
		code = `${commonJsDoc}
${args.exported !== false && isSafeBundleId ? "export " : ""}const ${safeBundleId} = /** @type {(${bundleFunctionType}) & { parts: ${partsFunctionType} } & ${messageMetadataType}} */ (
	/* @__PURE__ */ Object.assign(
		/** @type {${bundleFunctionType}} */ ((inputs${hasInputs ? "" : " = {}"}, options = {}) => {${keepUnusedInputsParameter("\t\t\t")}
${localeResolutionStatement("\t\t\t")}
			${compileLocaleReturnStatements("string", "\t\t\t")}${
				!isFullyTranslated
					? `\n			return /** @type {LocalizedString} */ (${JSON.stringify(args.bundle.id)})`
					: ""
			}
		}),
		{
			parts: /** @type {${partsFunctionType}} */ ((inputs${
				hasInputs ? "" : " = {}"
			}, options = {}) => {
${localeResolutionStatement("\t\t\t\t")}
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

	if (args.exported !== false && isSafeBundleId === false) {
		code += `\nexport { ${safeBundleId} as "${escapeForDoubleQuoteString(args.bundle.id)}" }`;
	}

	return {
		code,
		node: args.bundle,
	};
};

export function buildEnglishMatchTableDoc(bundle: BundleNested): string {
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
		const rowValues = selectorKeys.map((key) =>
			getMatchCellValue(variant, key)
		);
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

function collectSelectorKeys(
	message: BundleNested["messages"][number]
): string[] {
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
	let baseName = "";
	let capitalizeNext = true;

	for (const character of safeBundleId) {
		if (character === "_") {
			baseName += "_";
			capitalizeNext = true;
			continue;
		}

		if (character >= "a" && character <= "z") {
			baseName += capitalizeNext ? character.toUpperCase() : character;
		} else {
			baseName += character;
		}
		capitalizeNext = false;
	}

	if (!baseName) {
		baseName = "Message";
	}

	if (!/^[A-Za-z_]/.test(baseName)) {
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

export function buildMarkupSchemaType(
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

	// Matches on un-annotated aliases of an input match the input value too.
	// Widen an input type that was narrowed by direct matches: alias literals
	// join the union and an alias catchall accepts any value. Inputs that are
	// only matched through aliases keep their unnarrowed type.
	const declarations = bundle.declarations ?? [];
	for (const message of bundle.messages) {
		for (const variant of message.variants) {
			for (const match of variant.matches ?? []) {
				if (inputNames.has(match.key)) continue;
				const inputName = resolveInputAlias(match.key, declarations);
				if (inputName === undefined) continue;
				const info = matchTypes.get(inputName);
				if (!info) continue;
				if (match.type === "catchall-match") {
					info.hasCatchAll = true;
				} else if (match.type === "literal-match") {
					info.literals.add(match.value);
				}
			}
		}
	}

	return matchTypes;
}

export function bundleHasMarkup(bundle: BundleNested): boolean {
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
