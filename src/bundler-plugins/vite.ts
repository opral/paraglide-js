import { createVitePlugin } from "unplugin";
import type { Plugin } from "vite";
import type { CompilerOptions } from "../compiler/compiler-options.js";
import { createPerLocaleBuildPlugins } from "./per-locale-build/index.js";
import { unpluginFactory } from "./unplugin.js";

export type ParaglideVitePluginOptions = CompilerOptions & {
	/**
	 * Emit one compiler-specialized client asset tree per project locale.
	 *
	 * Requires Vite 8+. Builds one untouched Rolldown client environment per
	 * locale and emits `paraglide-vite-locales.json`. Locale changes need to use
	 * full-document navigation. Framework SSR graph selection requires a public
	 * framework integration API.
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
