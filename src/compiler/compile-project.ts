import { assertNoRemovedOptions } from "./removed-options.js";
import { compileBundle } from "./compile-bundle.js";
import type { InlangProject, BundleNested, ProjectSettings } from "@inlang/sdk";
import { lookup } from "../services/lookup.js";
import * as localeModules from "./output-structure/locale-modules.js";
import * as messageModules from "./output-structure/message-modules.js";
import * as messageShards from "./output-structure/message-shards.js";
import {
	defaultCompilerOptions,
	type CompilerOptions,
} from "./compiler-options.js";
import { createRuntimeFile } from "./runtime/create-runtime.js";
import { createServerFile } from "./server/create-server-file.js";
import { createRegistry } from "./registry.js";
import { emitTsDeclarations } from "./emit-ts-declarations.js";
import { emitSupportingDeclarations } from "./emit-supporting-declarations.js";
import { createReadme } from "./create-readme.js";
import { perLocaleBuildStaticLocaleExpression } from "./per-locale-build.js";

const outputStructures = {
	"locale-modules": localeModules,
	"message-modules": messageModules,
};

/**
 * Takes an inlang project and compiles it into a set of files.
 *
 * Use this function for more programmatic control than `compile()`.
 * You can adjust the output structure and get the compiled files as a return value.
 *
 * @example
 *   const output = await compileProject({ project, projectPath: "./project.inlang" });
 *   await writeOutput('path', output, fs.promises);
 */
export const compileProject = async (args: {
	project: InlangProject;
	projectPath?: string;
	compilerOptions?: Omit<CompilerOptions, "fs" | "project" | "outdir">;
}): Promise<Record<string, string>> => {
	assertNoRemovedOptions(args.compilerOptions ?? {});
	if (args.compilerOptions?.outputStructure === "virtual-modules") {
		throw new Error(
			'outputStructure: "virtual-modules" requires the Paraglide Vite plugin. Use "message-modules" or "locale-modules" for physical output.'
		);
	}
	const { selectBundleNested } = await import("@inlang/sdk");
	return compileCatalog({
		...args,
		catalog: {
			settings: await args.project.settings.get(),
			bundles: await selectBundleNested(args.project.db).execute(),
		},
	});
};

/** The detached settings and nested messages needed by the compiler. */
export type CatalogInput = {
	settings: ProjectSettings;
	bundles: BundleNested[];
};

/**
 * Compiles a read-only project catalog without querying or opening a database.
 * Both this entry point and compileProject use the same code generator.
 */
export const compileCatalog = async (args: {
	catalog: CatalogInput;
	projectPath?: string;
	compilerOptions?: Omit<CompilerOptions, "fs" | "project" | "outdir">;
}): Promise<Record<string, string>> => {
	assertNoRemovedOptions(args.compilerOptions ?? {});
	const optionsWithDefaults = {
		...defaultCompilerOptions,
		...args.compilerOptions,
	};
	if (optionsWithDefaults.outputStructure === "virtual-modules") {
		throw new Error(
			'outputStructure: "virtual-modules" requires the Paraglide Vite plugin. Use "message-modules" or "locale-modules" for physical output.'
		);
	}
	const messageModuleSize = optionsWithDefaults.messageModuleSize ?? 1;
	if (!Number.isSafeInteger(messageModuleSize) || messageModuleSize < 1) {
		throw new Error("messageModuleSize must be a positive safe integer");
	}
	if (
		messageModuleSize > 1 &&
		optionsWithDefaults.outputStructure !== "message-modules"
	) {
		throw new Error(
			"messageModuleSize above one requires message-modules outputStructure"
		);
	}
	if (
		messageModuleSize > 1 &&
		optionsWithDefaults.experimentalStaticLocale ===
			perLocaleBuildStaticLocaleExpression
	) {
		throw new Error(
			"messageModuleSize above one is not supported for locale-specialized builds"
		);
	}
	await ensureURLPatternAvailable();
	validateRouteStrategyMatchers(optionsWithDefaults.routeStrategies);

	const { settings, bundles } = args.catalog;

	//Maps each language to it's fallback
	//If there is no fallback, it will be undefined
	const fallbackMap = getFallbackMap(settings.locales, settings.baseLocale);

	const outputStructure = outputStructures[optionsWithDefaults.outputStructure];
	const bundleIds = bundles.map((bundle) => bundle.id);
	const moduleIds =
		messageModuleSize > 1
			? messageShards.moduleIds(bundleIds, messageModuleSize)
			: outputStructure.moduleIds(bundleIds, settings.locales);

	const compiledBundles = bundles.map((bundle) =>
		compileBundle({
			bundle,
			moduleId: moduleIds.get(bundle.id),
			fallbackMap,
			inlineMessages: optionsWithDefaults.outputStructure === "message-modules",
			exported: messageModuleSize === 1,
			fuseInlineMessages: true,
			compactTypes: messageModuleSize > 1,
			sharedMessageFactory: messageModuleSize > 1,
			messageReferenceExpression: outputStructure.messageReferenceExpression,
			settings,
			experimentalStaticLocale: optionsWithDefaults.experimentalStaticLocale,
		})
	);

	const output: Record<string, string> = {
		["runtime.js"]: createRuntimeFile({
			baseLocale: settings.baseLocale,
			locales: settings.locales,
			compilerOptions: optionsWithDefaults,
		}),
		["server.js"]: createServerFile({
			compilerOptions: optionsWithDefaults,
		}),
		["registry.js"]: createRegistry(),
		["messages.js"]: [
			"export * from './messages/_index.js'",
			"// enabling auto-import by exposing all messages as m",
			"export * as m from './messages/_index.js'",
		].join("\n"),
	};

	// generate the output modules
	Object.assign(
		output,
		messageModuleSize > 1
			? messageShards.generateOutput(
					compiledBundles,
					settings,
					fallbackMap,
					messageModuleSize
				)
			: outputStructure.generateOutput(compiledBundles, settings, fallbackMap)
	);

	if (optionsWithDefaults.emitGitIgnore) {
		output[".gitignore"] = ignoreDirectory;
	}

	if (optionsWithDefaults.emitPrettierIgnore) {
		output[".prettierignore"] = ignoreDirectory;
	}

	if (optionsWithDefaults.emitReadme) {
		output["README.md"] = createReadme({
			projectPath: args.projectPath,
			gitignored: optionsWithDefaults.emitGitIgnore,
		});
	}

	// Declare the generated message modules side-effect-free so bundlers can drop
	// unused re-exports from the `m` barrel per entry, instead of bundling every
	// message used anywhere in the app into one shared chunk that every entry
	// downloads. Scoped to `messages/` so `runtime.js` (one level up, which has
	// real side effects) is unaffected. This also lets locale-specialized builds
	// discard the unselected locale modules before Rolldown creates source maps.
	//
	// `type: "module"` is required: this package.json creates a new module scope
	// for `messages/`, and a package.json without a `type` field defaults to
	// CommonJS in Node — even when the consuming project is `type: "module"`.
	// Without it, the generated ESM `.js` files in `messages/` would be treated
	// as CommonJS and fail to resolve.
	// See https://github.com/opral/paraglide-js/issues/668
	if (
		optionsWithDefaults.outputStructure === "message-modules" ||
		optionsWithDefaults.experimentalStaticLocale ===
			perLocaleBuildStaticLocaleExpression
	) {
		output["messages/package.json"] =
			JSON.stringify({ type: "module", sideEffects: false }, undefined, "\t") +
			"\n";
	}

	for (const [filename, content] of Object.entries(output)) {
		if (optionsWithDefaults.includeEslintDisableComment) {
			if (filename.endsWith(".js")) {
				output[filename] = `/* eslint-disable */\n${content}`;
			}
		}
	}

	if (optionsWithDefaults.emitTsDeclarations) {
		Object.assign(
			output,
			emitSupportingDeclarations({
				baseLocale: settings.baseLocale,
				locales: settings.locales,
				compilerOptions: optionsWithDefaults,
			}),
			emitTsDeclarations({
				compiledBundles,
				bundles,
				settings,
				fallbackMap,
				outputStructure: optionsWithDefaults.outputStructure,
				messageModuleSize,
			})
		);
	}

	return output;
};

export function getFallbackMap<T extends string>(
	locales: T[],
	baseLocale: NoInfer<T>
): Record<T, T | undefined> {
	return Object.fromEntries(
		locales.map((lang) => {
			if (lang === baseLocale) return [lang, undefined];
			const fallbackLanguage = lookup(lang, {
				locales: locales.filter((l) => l !== lang),
				baseLocale,
			});

			if (lang === fallbackLanguage) return [lang, undefined];
			else return [lang, fallbackLanguage];
		})
	) as Record<T, T | undefined>;
}

const ignoreDirectory = `# ignore everything because the directory is auto-generated by inlang paraglide-js
# for more info visit https://paraglidejs.com
*
`;

async function ensureURLPatternAvailable() {
	try {
		new URLPattern({ pathname: "/:path(.*)?" });
	} catch {
		await import("urlpattern-polyfill");
	}
}

function validateRouteStrategyMatchers(
	routeStrategies: CompilerOptions["routeStrategies"]
) {
	if (!routeStrategies?.length) {
		return;
	}

	for (const [index, routeStrategy] of routeStrategies.entries()) {
		try {
			new URLPattern(routeStrategy.match, "https://example.com");
		} catch (error) {
			const details = error instanceof Error ? error.message : String(error);
			throw new Error(
				`Invalid routeStrategies[${index}].match "${routeStrategy.match}". URLPattern parsing failed: ${details}`
			);
		}
	}
}
