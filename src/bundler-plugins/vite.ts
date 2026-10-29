import { createVirtualMessagesPlugins } from "./virtual-messages.js";
import { createVitePlugin } from "unplugin";
import type { Plugin } from "vite";
import type { ParaglidePluginOptions } from "./unplugin.js";
import { createPerLocaleBuildPlugins } from "./per-locale-build/index.js";
import { unpluginFactory } from "./unplugin.js";

export type ParaglideVitePluginOptions = ParaglidePluginOptions & {
	/**
	 * Message output layout. Vite defaults to virtual-modules in development
	 * and production. Use message-modules or locale-modules for physical files.
	 * Virtual modules emit combined declarations and require this plugin.
	 *
	 * @default "virtual-modules"
	 */
	outputStructure?: ParaglidePluginOptions["outputStructure"];
	/**
	 * Respond with HTTP 500 while the development compiler or its config is
	 * invalid, instead of serving the last successful output. Error overlays
	 * remain enabled. Set this on the Vite plugin, not in paraglide.config.
	 *
	 * @default false
	 */
	devErrorResponse?: boolean;
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
	"experimentalPerLocaleBuild"
>;

const createPerLocaleCompilerVitePlugin =
	createVitePlugin<CompilerVitePluginOptions>(
		({ devErrorResponse, ...options }, meta) =>
			unpluginFactory(options, meta, {
				outputStructure: "locale-modules",
				devErrorResponse,
				validateOptions(options) {
					if (options.outputStructure === "virtual-modules")
						throw new Error(
							'outputStructure: "virtual-modules" cannot be combined with experimentalPerLocaleBuild'
						);
				},
			})
	);

export function paraglideVitePlugin(
	options: ParaglideVitePluginOptions
): Plugin | Plugin[] {
	const { experimentalPerLocaleBuild, devErrorResponse, ...compilerOptions } =
		options;
	if (!experimentalPerLocaleBuild) {
		if (compilerOptions.outputStructure === "virtual-modules") {
			if (compilerOptions.emitTsDeclarations === false)
				throw new Error(
					'outputStructure: "virtual-modules" requires emitTsDeclarations: true. Enable declarations or select "message-modules" or "locale-modules" for physical output.'
				);
			if ((compilerOptions.messageModuleSize ?? 1) !== 1)
				throw new Error(
					'outputStructure: "virtual-modules" requires messageModuleSize: 1'
				);
		}
		return createVirtualMessagesPlugins(compilerOptions, devErrorResponse);
	}
	if (compilerOptions.outputStructure === "virtual-modules")
		throw new Error(
			'outputStructure: "virtual-modules" cannot be combined with experimentalPerLocaleBuild'
		);

	return createPerLocaleBuildPlugins({
		compilerOptions,
		createCompilerPlugin: (options) =>
			createPerLocaleCompilerVitePlugin({
				...options,
				devErrorResponse,
			}) as Plugin,
	});
}
