import nodeFs from "node:fs";
import { loadProjectFromDirectory } from "@inlang/sdk";
import type { Plugin } from "vite";
import type { CompilerOptions } from "../../compiler/compiler-options.js";
import { perLocaleBuildStaticLocaleExpression } from "../../compiler/per-locale-build.js";
import type { PerLocaleBuildSettings } from "./types.js";
import { createPerLocaleBuildVitePlugin } from "./vite-plugin.js";

export function createPerLocaleBuildPlugins(args: {
	compilerOptions: CompilerOptions;
	createCompilerPlugin: (options: CompilerOptions) => Plugin;
}): Plugin[] {
	const { compilerOptions } = args;
	validateCompilerOptions(compilerOptions);

	const perLocaleCompilerOptions: CompilerOptions = {
		...compilerOptions,
		outputStructure: compilerOptions.outputStructure ?? "message-modules",
		experimentalStaticLocale: perLocaleBuildStaticLocaleExpression,
		additionalFiles: {
			...compilerOptions.additionalFiles,
		},
	};

	return [
		args.createCompilerPlugin(perLocaleCompilerOptions),
		createPerLocaleBuildVitePlugin({
			// Reload settings for every client build so Vite build --watch picks up
			// locale additions/removals instead of reusing the first build's project.
			settings: () => loadSettings(perLocaleCompilerOptions),
			generatedDirectory: perLocaleCompilerOptions.outdir,
			onFrameworkDetected(frameworkFiles) {
				assertGeneratedFilesAvailable(
					frameworkFiles,
					compilerOptions.additionalFiles
				);
				perLocaleCompilerOptions.additionalFiles = {
					...perLocaleCompilerOptions.additionalFiles,
					...frameworkFiles,
				};
			},
		}),
	];
}

function validateCompilerOptions(options: CompilerOptions): void {
	if (
		options.strategy !== undefined &&
		options.strategy[0] !== "url" &&
		options.strategy[0] !== "cookie"
	) {
		throw new Error(
			'experimentalPerLocaleBuild requires the first locale strategy to be "url" or "cookie".'
		);
	}
	if (options.routeStrategies !== undefined) {
		throw new Error(
			"experimentalPerLocaleBuild does not support routeStrategies."
		);
	}
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
		options.outputStructure !== "message-modules"
	) {
		throw new Error(
			'experimentalPerLocaleBuild currently requires outputStructure: "message-modules".'
		);
	}
}

function assertGeneratedFilesAvailable(
	generatedFiles: Record<string, string>,
	additionalFiles: CompilerOptions["additionalFiles"]
): void {
	for (const fileName of Object.keys(generatedFiles)) {
		if (Object.hasOwn(additionalFiles ?? {}, fileName)) {
			throw new Error(
				`experimentalPerLocaleBuild needs to generate ${JSON.stringify(fileName)}, but additionalFiles already defines that path.`
			);
		}
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
