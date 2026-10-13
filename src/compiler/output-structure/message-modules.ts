import type { ProjectSettings } from "@inlang/sdk";
import type { CompiledBundleWithMessages } from "../compile-bundle.js";
import { escapeForSingleQuoteString } from "../../services/codegen/escape.js";
import { toSafeModuleId } from "../safe-module-id.js";
import { inputsType } from "../jsdoc-types.js";
import { toBundleInputTypeAliasName } from "../compile-bundle.js";

export function messageReferenceExpression(locale: string, bundleId: string) {
	return `${toSafeModuleId(locale)}_${toSafeModuleId(bundleId)}`;
}

export function generateOutput(
	compiledBundles: CompiledBundleWithMessages[],
	settings: Pick<ProjectSettings, "locales" | "baseLocale">,
	fallbackMap: Record<string, string | undefined>,
	experimentalMiddlewareLocaleSplitting = false
): Record<string, string> {
	const output: Record<string, string> = {};

	const moduleExports = new Map<string, string>();

	for (const compiledBundle of compiledBundles) {
		const bundleId = compiledBundle.bundle.node.id;
		const safeModuleId = toSafeModuleId(compiledBundle.bundle.node.id);

		// bundle file
		const filename = `messages/${safeModuleId}.js`;

		if (safeModuleId === "_index") {
			throw new Error(
				`Message ID ${JSON.stringify(bundleId)} maps to the reserved module filename: _index.js`
			);
		}
		const previous = moduleExports.get(`${safeModuleId}.js`);
		if (previous !== undefined) {
			throw new Error(
				`Message IDs ${JSON.stringify(previous)} and ${JSON.stringify(bundleId)} map to the same module filename: ${safeModuleId}.js`
			);
		}
		moduleExports.set(`${safeModuleId}.js`, bundleId);

		const rendered = renderMessage(compiledBundle, settings, fallbackMap);
		output[filename] =
			messageImports(
				experimentalMiddlewareLocaleSplitting,
				rendered.usesRegistry
			) +
			rendered.inputType +
			rendered.code;
	}

	// all messages index file
	output["messages/_index.js"] =
		`/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */\n` +
		Array.from(moduleExports)
			.map(([filename, bundleId]) =>
				bundleId === "then"
					? `export { __paraglide_then as then } from './${filename}'`
					: `export * from './${filename}'`
			)
			.join("\n");

	return output;
}

export function renderMessage(
	compiledBundle: CompiledBundleWithMessages,
	settings: Pick<ProjectSettings, "locales" | "baseLocale">,
	fallbackMap: Record<string, string | undefined>
) {
	const bundleId = compiledBundle.bundle.node.id;
	const safeModuleId = toSafeModuleId(bundleId);
	const inputs =
		compiledBundle.bundle.node.declarations?.filter(
			(decl) => decl.type === "input-variable"
		) ?? [];
	const matchTypes = compiledBundle.matchTypes;
	const inputTypeAliasName =
		compiledBundle.inputTypeAliasName ??
		toBundleInputTypeAliasName(safeModuleId);
	const inputTypeDefinition = inputsType(inputs, matchTypes);
	let code = compiledBundle.bundle.code;

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

	code = messages.join("\n\n") + "\n\n" + code;

	const usesRegistry = settings.locales.some(
		(locale) =>
			(compiledBundle.messages[locale]?.registryFunctions.length ?? 0) > 0
	);
	return {
		code,
		usesRegistry,
		inputType: `/** @typedef {${inputTypeDefinition}} ${inputTypeAliasName} */\n\n`,
	};
}

export function messageImports(middleware: boolean, registry: boolean): string {
	const runtime = middleware
		? "getLocale, trackMessageCall, experimentalMiddlewareLocaleSplitting, isServer, experimentalStaticLocale"
		: "getLocale, experimentalStaticLocale";
	return (
		(registry ? "import * as registry from '../registry.js'\n" : "") +
		`import { ${runtime} } from '../runtime.js';\n\n/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */\n\n`
	);
}
