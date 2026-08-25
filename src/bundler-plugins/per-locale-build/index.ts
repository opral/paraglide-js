import nodeFs from "node:fs";
import { resolve } from "node:path";
import { loadProjectFromDirectory } from "@inlang/sdk";
import type { Plugin } from "vite";
import { perLocaleBuildStaticLocaleExpression } from "../../compiler/per-locale-build.js";
import type { PerLocaleBuildSettings } from "./types.js";
import { createViteLocaleEnvironmentPlugin } from "./vite-environments.js";
import {
	loadParaglideConfig,
	resolveCompilerOptions,
	type ParaglideConfig,
} from "../../services/config/index.js";
import type { ParaglidePluginOptions } from "../unplugin.js";

export function createPerLocaleBuildPlugins(args: {
	compilerOptions: ParaglidePluginOptions;
	createCompilerPlugin: (options: ParaglidePluginOptions) => Plugin;
}): Plugin[] {
	// Config file values are not known yet — they are validated in
	// loadSettings once the config has been loaded.
	validateExplicitCompilerOptions(args.compilerOptions, undefined);
	const compilerOptions = createPerLocaleCompilerOptions(args.compilerOptions);
	// Project root as reported by vite. Config file discovery starts here.
	let discoveryRoot: string | undefined;
	return [
		{
			name: "paraglide-config-discovery-root",
			enforce: "pre",
			// The locale-environment plugin loads settings from its own
			// `config` hook, which runs BEFORE any `configResolved`. Capture
			// an explicitly configured root here so it is available in time;
			// `configResolved` still overwrites it with Vite's final value
			// (covering roots supplied via CLI flags).
			config(config) {
				if (config.root !== undefined) discoveryRoot = config.root;
			},
			configResolved(config) {
				discoveryRoot = config.root;
			},
		},
		args.createCompilerPlugin(compilerOptions),
		createViteLocaleEnvironmentPlugin({
			settings: () => loadSettings(args.compilerOptions, discoveryRoot),
		}),
	];
}

function createPerLocaleCompilerOptions(
	compilerOptions: ParaglidePluginOptions
): ParaglidePluginOptions {
	return {
		...compilerOptions,
		outputStructure: compilerOptions.outputStructure ?? "locale-modules",
		experimentalStaticLocale: perLocaleBuildStaticLocaleExpression,
		// Only forward additionalFiles when explicitly supplied — an empty
		// object would override files provided by paraglide.config.*.
		...(compilerOptions.additionalFiles !== undefined
			? { additionalFiles: { ...compilerOptions.additionalFiles } }
			: {}),
	};
}

// Values that come from the paraglide config file are only known after
// loading it, so conflicts are checked against both sources here. Only
// explicitly set values conflict; unset ones fall back to the per-locale
// defaults.
function validateExplicitCompilerOptions(
	options: ParaglidePluginOptions,
	config: ParaglideConfig | undefined
): void {
	const explicit = {
		experimentalStaticLocale:
			options.experimentalStaticLocale ?? config?.experimentalStaticLocale,
		experimentalMiddlewareLocaleSplitting:
			options.experimentalMiddlewareLocaleSplitting ??
			config?.experimentalMiddlewareLocaleSplitting,
		outputStructure: options.outputStructure ?? config?.outputStructure,
	};
	if (explicit.experimentalStaticLocale !== undefined) {
		throw new Error(
			"experimentalPerLocaleBuild cannot be combined with experimentalStaticLocale because it controls the compiler's static locale expression."
		);
	}
	if (explicit.experimentalMiddlewareLocaleSplitting) {
		throw new Error(
			"experimentalPerLocaleBuild cannot be combined with experimentalMiddlewareLocaleSplitting."
		);
	}
	if (
		explicit.outputStructure !== undefined &&
		explicit.outputStructure !== "locale-modules"
	) {
		throw new Error(
			'experimentalPerLocaleBuild requires outputStructure: "locale-modules".'
		);
	}
}

async function loadSettings(
	options: ParaglidePluginOptions,
	discoveryRoot?: string | undefined
): Promise<PerLocaleBuildSettings> {
	const root = discoveryRoot ?? process.cwd();
	const loaded = await loadParaglideConfig({
		projectDir: resolve(root, options.project),
	});
	validateExplicitCompilerOptions(options, loaded?.config);
	const { project } = resolveCompilerOptions({
		config: loaded?.config,
		overrides: options,
		root,
	});
	const loadedProject = await loadProjectFromDirectory({
		path: project,
		fs: options.fs ?? nodeFs,
	});
	try {
		const settings = await loadedProject.settings.get();
		return {
			baseLocale: settings.baseLocale,
			locales: [...settings.locales],
		};
	} finally {
		await loadedProject.close();
	}
}
