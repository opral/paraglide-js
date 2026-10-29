import { createVirtualMessagesPlugins } from "./virtual-messages.js";
import { createVitePlugin } from "unplugin";
import type { Plugin } from "vite";
import type { ParaglidePluginOptions } from "./unplugin.js";
import { createPerLocaleBuildPlugins } from "./per-locale-build/index.js";
import { unpluginFactory } from "./unplugin.js";

export type ParaglideVitePluginOptions = ParaglidePluginOptions & {
	/**
	 * Respond with HTTP 500 while the development compiler or its config is
	 * invalid, instead of serving the last successful output. Error overlays
	 * remain enabled. Set this on the Vite plugin, not in paraglide.config.
	 *
	 * @default false
	 */
	devErrorResponse?: boolean;
	/**
	 * Serve message implementations virtually with one physical messages.d.ts.
	 * Requires the Vite integration at runtime; incompatible with per-locale builds.
	 * @experimental
	 * @default false
	 */
	experimentalVirtualMessages?: boolean;
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

type CompilerVitePluginOptions = Omit<
	ParaglideVitePluginOptions,
	"experimentalPerLocaleBuild" | "experimentalVirtualMessages"
>;

const createCompilerVitePlugin = createVitePlugin<CompilerVitePluginOptions>(
	({ devErrorResponse, ...options }, meta) =>
		unpluginFactory(options, meta, { devErrorResponse })
);
const createPerLocaleCompilerVitePlugin =
	createVitePlugin<CompilerVitePluginOptions>(
		({ devErrorResponse, ...options }, meta) =>
			unpluginFactory(options, meta, {
				outputStructure: "locale-modules",
				devErrorResponse,
			})
	);

export function paraglideVitePlugin(
	options: ParaglideVitePluginOptions
): Plugin | Plugin[] {
	const {
		experimentalPerLocaleBuild,
		experimentalVirtualMessages,
		devErrorResponse,
		...compilerOptions
	} = options;
	if (experimentalVirtualMessages) {
		if (experimentalPerLocaleBuild)
			throw new Error(
				"experimentalVirtualMessages cannot be combined with experimentalPerLocaleBuild"
			);
		if (
			compilerOptions.outputStructure &&
			compilerOptions.outputStructure !== "message-modules"
		)
			throw new Error("experimentalVirtualMessages requires message-modules");
		if (compilerOptions.emitTsDeclarations === false)
			throw new Error(
				"experimentalVirtualMessages requires emitTsDeclarations"
			);
		return createVirtualMessagesPlugins(compilerOptions, devErrorResponse);
	}
	if (!experimentalPerLocaleBuild) {
		return createCompilerVitePlugin({
			...compilerOptions,
			devErrorResponse,
		}) as Plugin;
	}

	return createPerLocaleBuildPlugins({
		compilerOptions,
		createCompilerPlugin: (options) =>
			createPerLocaleCompilerVitePlugin({
				...options,
				devErrorResponse,
			}) as Plugin,
	});
}
