import type { ProjectSettings } from "@inlang/sdk";
import type { CompiledBundleWithMessages } from "../compile-bundle.js";
import { toBundleInputTypeAliasName } from "../compile-bundle.js";
import { inputsType } from "../jsdoc-types.js";
import {
	jsShardFactory,
	jsShardTypes,
	jsShardTypesImport,
	shardTypesModule,
} from "./shard-types.js";
import { generateMessageBody } from "./message-modules.js";
import { allocateModuleIds } from "../safe-module-id.js";
import { registryBinding } from "../registry.js";

/**
 * Allocates the binding and type name of each message within its shard, the
 * module that declares them. Grouped modules have no message files, so no
 * name is reserved.
 */
export function moduleIds(
	bundleIds: readonly string[],
	size: number
): Map<string, string> {
	const moduleIds = new Map<string, string>();
	for (let start = 0; start < bundleIds.length; start += size)
		for (const [id, moduleId] of allocateModuleIds(
			bundleIds.slice(start, start + size),
			new Set()
		))
			moduleIds.set(id, moduleId);
	return moduleIds;
}

/** Isolated pure wrappers preserve tree shaking and each message's local bindings. */
export function generateOutput(
	bundles: CompiledBundleWithMessages[],
	settings: Pick<ProjectSettings, "locales" | "baseLocale">,
	fallbackMap: Record<string, string | undefined>,
	size: number
): Record<string, string> {
	const output: Record<string, string> = {};
	const files: string[] = [];
	for (let start = 0; start < bundles.length; start += size) {
		const shard = bundles.slice(start, start + size);
		const filename = `_shard_${files.length}.js`;
		const names = new Set(shard.map((b) => b.moduleId));
		files.push(filename);
		const runtime = `getLocale, experimentalStaticLocale${shard.some((bundle) => bundle.usesDevelopmentDiagnostics) ? ", isDevelopment" : ""}`;
		const chunks = [
			`import { ${runtime} } from '../runtime.js';`,
			"/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */",
			jsShardTypesImport,
		];
		if (
			shard.some((b) =>
				Object.values(b.messages).some((m) => m.registryFunctions.length)
			)
		)
			chunks.unshift(`import * as ${registryBinding} from '../registry.js';`);
		for (const optional of [false, true]) {
			if (
				shard.some(
					(b) =>
						b.usesSharedFactory &&
						(b.bundle.node.declarations.length === 0) === optional
				)
			) {
				chunks.push(
					jsShardFactory(
						Object.keys(fallbackMap),
						settings.baseLocale,
						optional
					)
				);
			}
		}
		for (let offset = 0; offset < shard.length; offset++) {
			const bundle = shard[offset]!;
			const id = bundle.bundle.node.id;
			const safe = bundle.moduleId;
			const alias =
				bundle.inputTypeAliasName ?? toBundleInputTypeAliasName(safe);
			const inputs = bundle.bundle.node.declarations.filter(
				(d) => d.type === "input-variable"
			);
			chunks.push(
				`/** @typedef {${inputsType(inputs, bundle.matchTypes)}} ${alias} */`
			);
			const body = bundle.usesSharedFactory
				? bundle.bundle.code
				: generateMessageBody(bundle, settings, fallbackMap, alias);
			const allInline =
				bundle.usesSharedFactory ||
				settings.locales.every(
					(locale) =>
						bundle.messages[locale] &&
						bundle.unreferencedMessageLocales?.includes(locale)
				);
			if (allInline && safe !== "undefined") {
				chunks.push(`${body}\nexport { ${safe} as ${JSON.stringify(id)} };`);
			} else {
				let local = `__message_${offset}`;
				while (names.has(local)) local += "_";
				chunks.push(
					`const ${local} = /* @__PURE__ */ (() => {\n${body}\nreturn ${safe};\n})();\nexport { ${local} as ${JSON.stringify(id)} };`
				);
			}
		}
		output[`messages/${filename}`] = chunks.join("\n\n");
	}
	if (files.length > 0)
		output[`messages/${shardTypesModule}.js`] = jsShardTypes(settings.locales);
	output["messages/_index.js"] = [
		"/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */",
		...files.map((f) => `export * from './${f}';`),
	].join("\n");
	return output;
}
