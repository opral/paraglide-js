import { createVitePlugin } from "unplugin";
import type { Plugin } from "vite";
import type { CompilerOptions } from "../compiler/compiler-options.js";
import { createPerLocaleBuildPlugins } from "./per-locale-build/index.js";
import { unpluginFactory } from "./unplugin.js";

export type ParaglideVitePluginOptions = CompilerOptions & {
	/**
	 * Emit one compiler-specialized client asset tree per project locale.
	 *
	 * Supports the documented default configurations of TanStack Start and
	 * SvelteKit on Vite 8.x. Unsupported framework and asset configurations fail
	 * during the build. Locale changes need to use full-document navigation.
	 *
	 * @experimental
	 * @default false
	 */
	experimentalPerLocaleBuild?: boolean;
};

const createCompilerVitePlugin = createVitePlugin(unpluginFactory);

export function paraglideVitePlugin(
	options: ParaglideVitePluginOptions
): Plugin | Plugin[] {
	const { experimentalPerLocaleBuild, ...compilerOptions } = options;
	if (!experimentalPerLocaleBuild) {
		return createCompilerVitePlugin(compilerOptions) as Plugin;
	}

	return createPerLocaleBuildPlugins({
		compilerOptions,
		createCompilerPlugin: (options) =>
			createCompilerVitePlugin(options) as Plugin,
	});
}
