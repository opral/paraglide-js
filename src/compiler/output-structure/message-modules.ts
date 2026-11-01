import type { ProjectSettings } from "@inlang/sdk";
import type { CompiledBundleWithMessages } from "../compile-bundle.js";
import { escapeForSingleQuoteString } from "../../services/codegen/escape.js";
import { allocateModuleIds, toSafeModuleId } from "../safe-module-id.js";
import { inputsType } from "../jsdoc-types.js";
import { toBundleInputTypeAliasName } from "../compile-bundle.js";
import { registryBinding } from "../registry.js";

/** The barrel's file name, which a message cannot take. */
const reservedModuleIds: ReadonlySet<string> = new Set(["_index"]);

/** Allocates the module id of each message: its file name and binding. */
export function moduleIds(bundleIds: Iterable<string>): Map<string, string> {
	return allocateModuleIds(bundleIds, reservedModuleIds);
}

export function messageReferenceExpression(
	locale: string,
	_bundleId: string,
	moduleId: string
) {
	return `${toSafeModuleId(locale)}_${moduleId}`;
}

export function generateOutput(
	compiledBundles: CompiledBundleWithMessages[],
	settings: Pick<ProjectSettings, "locales" | "baseLocale">,
	fallbackMap: Record<string, string | undefined>
): Record<string, string> {
	const output: Record<string, string> = {};

	const moduleFilenames = new Set<string>();

	for (const compiledBundle of compiledBundles) {
		const safeModuleId = compiledBundle.moduleId;
		const inputs =
			compiledBundle.bundle.node.declarations?.filter(
				(decl) => decl.type === "input-variable"
			) ?? [];
		const matchTypes = compiledBundle.matchTypes;
		const inputTypeAliasName =
			compiledBundle.inputTypeAliasName ??
			toBundleInputTypeAliasName(safeModuleId);
		const inputTypeDefinition = inputsType(inputs, matchTypes);

		// bundle file
		const filename = `messages/${safeModuleId}.js`;

		moduleFilenames.add(`${safeModuleId}.js`);

		// create fresh bundle file
		output[filename] = compiledBundle.bundle.code;

		const body = generateMessageBody(
			compiledBundle,
			settings,
			fallbackMap,
			inputTypeAliasName
		);

		output[filename] = body;

		// add the imports and type reference (LocalizedString is defined in runtime.js)
		const runtimeImport = `import { getLocale, experimentalStaticLocale${compiledBundle.usesDevelopmentDiagnostics ? ", isDevelopment" : ""} } from '../runtime.js';\n\n`;

		output[filename] =
			runtimeImport +
			`/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */\n\n` +
			`/** @typedef {${inputTypeDefinition}} ${inputTypeAliasName} */\n\n` +
			output[filename];

		// Add the registry import to the message file if a message calls the
		// registry. Decided from compiler metadata, not from the file text,
		// which also contains message text like "Open the registry. Now."
		const usesRegistry = settings.locales.some(
			(locale) =>
				(compiledBundle.messages[locale]?.registryFunctions.length ?? 0) > 0
		);
		if (usesRegistry) {
			output[filename] =
				`import * as ${registryBinding} from '../registry.js'\n` +
				output[filename];
		}
	}

	// all messages index file
	output["messages/_index.js"] =
		`/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */\n` +
		Array.from(moduleFilenames)
			.map((filename) => `export * from './${filename}'`)
			.join("\n");

	return output;
}

/** Locale helpers and dispatcher, without shared module imports or typedefs. */
export function generateMessageBody(
	compiledBundle: CompiledBundleWithMessages,
	settings: Pick<ProjectSettings, "locales" | "baseLocale">,
	fallbackMap: Record<string, string | undefined>,
	inputTypeAliasName: string
): string {
	const bundleId = compiledBundle.bundle.node.id;
	const safeModuleId = compiledBundle.moduleId;
	const needsFallback: string[] = [];

	const messages: string[] = [];

	// messages
	for (const locale of settings.locales) {
		const safeLocale = toSafeModuleId(locale);
		const compiledMessage = compiledBundle.messages[locale];

		if (!compiledMessage) {
			needsFallback.push(locale);
		} else if (!compiledBundle.unreferencedMessageLocales?.includes(locale)) {
			messages.push(
				`const ${safeLocale}_${safeModuleId} = ${compiledMessage.code}`
			);
		}
	}

	// add the fallbacks (needs to be done after the messages to avoid referencing
	// the message before they are defined)
	const needsFallbackSet = new Set(needsFallback);
	const emittedFallbacks = new Set<string>();
	const emittingFallbacks = new Set<string>();

	/**
	 * Emits the fallback definition for a locale ensuring that dependent fallbacks
	 * are declared beforehand.
	 *
	 * @example
	 * emitFallback("fr-ca");
	 */
	const emitFallback = (locale: string) => {
		if (emittedFallbacks.has(locale)) return;
		if (emittingFallbacks.has(locale)) return;

		emittingFallbacks.add(locale);

		const safeLocale = toSafeModuleId(locale);
		const fallbackLocale = fallbackMap[locale];

		if (
			fallbackLocale &&
			needsFallbackSet.has(fallbackLocale) &&
			!compiledBundle.messages[fallbackLocale]
		) {
			emitFallback(fallbackLocale);
		}

		if (fallbackLocale) {
			const safeFallbackLocale = toSafeModuleId(fallbackLocale);
			messages.push(
				`/** @type {(inputs: ${inputTypeAliasName}) => LocalizedString} */\nconst ${safeLocale}_${safeModuleId} = ${safeFallbackLocale}_${safeModuleId};`
			);
		} else {
			messages.push(
				`/** @type {(inputs: ${inputTypeAliasName}) => LocalizedString} */\nconst ${safeLocale}_${safeModuleId} = () => /** @type {LocalizedString} */ ('${escapeForSingleQuoteString(
					bundleId
				)}')`
			);
		}

		emittingFallbacks.delete(locale);
		emittedFallbacks.add(locale);
	};

	for (const locale of needsFallback) {
		emitFallback(locale);
	}

	return messages.join("\n\n") + "\n\n" + compiledBundle.bundle.code;
}
