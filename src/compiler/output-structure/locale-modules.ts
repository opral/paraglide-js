import type { ProjectSettings } from "@inlang/sdk";
import type { CompiledBundleWithMessages } from "../compile-bundle.js";
import { allocateModuleIds, toSafeModuleId } from "../safe-module-id.js";
import { inputsType } from "../jsdoc-types.js";
import { toBundleInputTypeAliasName } from "../compile-bundle.js";
import { registryBinding } from "../registry.js";

const localeImportPrefix = "__";

/**
 * Allocates the binding of each message, which cannot be one of the locale
 * namespaces the index imports.
 */
export function moduleIds(
	bundleIds: Iterable<string>,
	locales: readonly string[]
): Map<string, string> {
	return allocateModuleIds(
		bundleIds,
		new Set(
			locales.map((locale) => `${localeImportPrefix}${toSafeModuleId(locale)}`)
		)
	);
}

export function messageReferenceExpression(
	locale: string,
	_bundleId: string,
	moduleId: string
) {
	return `${localeImportPrefix}${toSafeModuleId(locale)}.${moduleId}`;
}

export function generateOutput(
	compiledBundles: CompiledBundleWithMessages[],
	settings: Pick<ProjectSettings, "locales" | "baseLocale">,
	fallbackMap: Record<string, string | undefined>
): Record<string, string> {
	const runtimeImport = `import { getLocale, experimentalStaticLocale${compiledBundles.some((bundle) => bundle.usesDevelopmentDiagnostics) ? ", isDevelopment" : ""} } from "../runtime.js"`;

	const indexFile = [
		runtimeImport,
		"",
		`/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */`,
		...compiledBundles.map((compiledBundle) => {
			const bundleModuleId = compiledBundle.moduleId;
			const inputTypeAliasName =
				compiledBundle.inputTypeAliasName ??
				toBundleInputTypeAliasName(bundleModuleId);
			const inputs =
				compiledBundle.bundle.node.declarations?.filter(
					(decl) => decl.type === "input-variable"
				) ?? [];
			return `/** @typedef {${inputsType(inputs, compiledBundle.matchTypes)}} ${inputTypeAliasName} */`;
		}),
		settings.locales
			.map(
				(locale) =>
					`import * as ${localeImportPrefix}${toSafeModuleId(locale)} from "./${locale}.js"`
			)
			.join("\n"),
		compiledBundles.map(({ bundle }) => bundle.code).join("\n"),
	].join("\n");

	const output: Record<string, string> = {
		["messages/_index.js"]: indexFile,
	};

	// generate message files
	for (const locale of settings.locales) {
		const filename = `messages/${locale}.js`;
		let file = "";
		const inputTypeDefs: string[] = [];
		const emittedInputTypeDefs = new Set<string>();
		// decided from compiler metadata, not from the file text, which also
		// contains message text like "Open the registry. Now."
		let usesRegistry = false;

		for (const compiledBundle of compiledBundles) {
			const compiledMessage = compiledBundle.messages[locale];
			const bundleModuleId = compiledBundle.moduleId;
			const bundleId = compiledBundle.bundle.node.id;
			const inputs =
				compiledBundle.bundle.node.declarations?.filter(
					(decl) => decl.type === "input-variable"
				) ?? [];
			const matchTypes = compiledBundle.matchTypes;
			const inputTypeAliasName =
				compiledBundle.inputTypeAliasName ??
				toBundleInputTypeAliasName(bundleModuleId);
			if (!emittedInputTypeDefs.has(inputTypeAliasName)) {
				inputTypeDefs.push(
					`/** @typedef {${inputsType(inputs, matchTypes)}} ${inputTypeAliasName} */`
				);
				emittedInputTypeDefs.add(inputTypeAliasName);
			}
			if (!compiledMessage) {
				const fallbackLocale = fallbackMap[locale];
				if (fallbackLocale) {
					// use the fall back locale e.g. render the message in English if the German message is missing
					file += `\nexport { ${bundleModuleId} } from "./${fallbackLocale}.js"`;
				} else {
					// no fallback exists, render the bundleId
					file += `\n/** @type {(inputs: ${inputTypeAliasName}) => LocalizedString} */\nexport const ${bundleModuleId} = () => /** @type {LocalizedString} */ (${JSON.stringify(bundleId)})`;
				}
				continue;
			}

			if (compiledMessage.registryFunctions.length > 0) {
				usesRegistry = true;
			}
			file += `\n\nexport const ${bundleModuleId} = ${compiledMessage.code}`;
		}

		// add import if used
		if (usesRegistry) {
			file = `import * as ${registryBinding} from "../registry.js"\n` + file;
		}

		// add LocalizedString typedef reference if used
		if (file.includes("LocalizedString")) {
			const inputTypeDefsBlock = inputTypeDefs.length
				? `${inputTypeDefs.join("\n")}\n`
				: "";
			file =
				`/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */\n` +
				inputTypeDefsBlock +
				file;
		}

		output[filename] = file;
	}
	return output;
}
