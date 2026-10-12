import { createVitePlugin } from "unplugin";
import type { Plugin } from "vite";
import type { ParaglidePluginOptions } from "./unplugin.js";
import { createPerLocaleBuildPlugins } from "./per-locale-build/index.js";
import {
	unpluginFactory,
	viteClientLocaleSplitOption,
	type ViteClientLocaleSplitState,
} from "./unplugin.js";
import { createClientLocaleSplitPlugin } from "./client-locale-split/vite-plugin.js";

export type ParaglideVitePluginOptions = ParaglidePluginOptions & {
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
	/**
	 * Load only the active locale's message module in the Vite client bundle.
	 *
	 * Requires the generated locale-modules layout and an explicit Vite build
	 * target of ES2022 or newer (or `esnext`) for the startup facade's
	 * top-level await. The server-rendered graph remains unchanged.
	 *
	 * @experimental
	 * @default false
	 */
	experimentalClientLocaleSplit?: boolean;
};

const createCompilerVitePlugin = createVitePlugin(unpluginFactory);

export function paraglideVitePlugin(
	options: ParaglideVitePluginOptions
): Plugin | Plugin[] {
	const {
		experimentalPerLocaleBuild,
		experimentalClientLocaleSplit,
		...compilerOptions
	} = options;
	if (experimentalPerLocaleBuild && experimentalClientLocaleSplit) {
		throw new Error(
			"experimentalClientLocaleSplit cannot be combined with experimentalPerLocaleBuild."
		);
	}
	if (!experimentalPerLocaleBuild) {
		if (!experimentalClientLocaleSplit) {
			return createCompilerVitePlugin(compilerOptions) as Plugin;
		}
		if (
			compilerOptions.outputStructure !== undefined &&
			compilerOptions.outputStructure !== "locale-modules"
		) {
			throw new Error(
				'experimentalClientLocaleSplit requires outputStructure: "locale-modules".'
			);
		}
		if (compilerOptions.experimentalMiddlewareLocaleSplitting) {
			throw new Error(
				"experimentalClientLocaleSplit cannot be combined with experimentalMiddlewareLocaleSplitting."
			);
		}
		if (compilerOptions.experimentalStaticLocale !== undefined) {
			throw new Error(
				"experimentalClientLocaleSplit cannot be combined with experimentalStaticLocale."
			);
		}
		const state: ViteClientLocaleSplitState = {};
		const compilerPlugin = createCompilerVitePlugin({
			...compilerOptions,
			outputStructure: "locale-modules",
			[viteClientLocaleSplitOption]: state,
		} as ParaglidePluginOptions);
		return [compilerPlugin as Plugin, createClientLocaleSplitPlugin({ state })];
	}

	return createPerLocaleBuildPlugins({
		compilerOptions,
		createCompilerPlugin: (options) =>
			createCompilerVitePlugin(options) as Plugin,
	});
}
