import nodeFs from "node:fs";
import { loadProjectFromDirectory } from "@inlang/sdk";
import type { Plugin } from "vite";
import type { CompilerOptions } from "../../compiler/compiler-options.js";
import { perLocaleBuildStaticLocaleExpression } from "../../compiler/per-locale-build.js";
import type { PerLocaleBuildSettings } from "./types.js";
import { createViteLocaleEnvironmentPlugin } from "./vite-environments.js";

export function createPerLocaleBuildPlugins(args: {
	compilerOptions: CompilerOptions;
	createCompilerPlugin: (options: CompilerOptions) => Plugin;
}): Plugin[] {
	validateCompilerOptions(args.compilerOptions);
	const compilerOptions = createPerLocaleCompilerOptions(args.compilerOptions);
	return [
		args.createCompilerPlugin(compilerOptions),
		createViteLocaleEnvironmentPlugin({
			settings: () => loadSettings(compilerOptions),
		}),
	];
}

function createPerLocaleCompilerOptions(
	compilerOptions: CompilerOptions
): CompilerOptions {
	return {
		...compilerOptions,
		outputStructure: compilerOptions.outputStructure ?? "locale-modules",
		experimentalStaticLocale: perLocaleBuildStaticLocaleExpression,
		additionalFiles: {
			...compilerOptions.additionalFiles,
		},
	};
}

function validateCompilerOptions(options: CompilerOptions): void {
	if (options.experimentalStaticLocale !== undefined) {
		throw new Error(
			"experimentalPerLocaleBuild cannot be combined with experimentalStaticLocale because it controls the compiler's static locale expression."
		);
	}
	if (options.experimentalMiddlewareLocaleSplitting) {
		throw new Error(
			"experimentalPerLocaleBuild cannot be combined with experimentalMiddlewareLocaleSplitting."
		);
	}
	if (
		options.outputStructure !== undefined &&
		options.outputStructure !== "locale-modules"
	) {
		throw new Error(
			'experimentalPerLocaleBuild requires outputStructure: "locale-modules".'
		);
	}
}

async function loadSettings(
	options: Pick<CompilerOptions, "project" | "fs">
): Promise<PerLocaleBuildSettings> {
	const project = await loadProjectFromDirectory({
		path: options.project,
		fs: options.fs ?? nodeFs,
	});
	try {
		const settings = await project.settings.get();
		return {
			baseLocale: settings.baseLocale,
			locales: [...settings.locales],
		};
	} finally {
		await project.close();
	}
}
