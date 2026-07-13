import type { Plugin } from "vite";
import {
	PER_LOCALE_BUILD_DEFINE,
	PER_LOCALE_BUILD_MANIFEST,
} from "./constants.js";
import {
	configurePerLocaleBuild,
	detectPerLocaleBuildFramework,
} from "./frameworks/index.js";
import {
	loadViteOxcApi,
	specializePerLocaleBundle,
} from "./specialize-bundle.js";
import type {
	PerLocaleBuildFramework,
	PerLocaleBuildServerIntegration,
	PerLocaleBuildSettings,
	ViteOxcApi,
} from "./types.js";

export function createPerLocaleBuildVitePlugin(args: {
	settings: () => Promise<PerLocaleBuildSettings>;
	generatedDirectory: string;
	loadVite?: () => Promise<ViteOxcApi>;
	onFrameworkDetected?: (generatedFiles: Record<string, string>) => void;
}): Plugin {
	let framework: PerLocaleBuildFramework | undefined;
	let serverIntegration: PerLocaleBuildServerIntegration | undefined;

	return {
		name: "paraglide-per-locale-build",
		enforce: "post",
		config(config, env) {
			if (env.command !== "build") return;
			if (![undefined, "", "/", "./"].includes(config.base)) {
				throw new Error(
					"experimentalPerLocaleBuild does not support a custom Vite base."
				);
			}
			assertSupportedClientBuild(config.build);
			return configurePerLocaleBuild(config);
		},
		configEnvironment(name, config, env) {
			const isClient =
				env.command === "build" &&
				(config.consumer === "client" || name === "client");
			if (!isClient) {
				return {
					define: { [PER_LOCALE_BUILD_DEFINE]: "undefined" },
				};
			}
			assertSupportedClientBuild(config.build);
			return { build: { minify: false, sourcemap: false } };
		},
		configResolved(config) {
			framework = detectPerLocaleBuildFramework(config);
			args.onFrameworkDetected?.(framework.generatedFiles ?? {});
			serverIntegration = framework.createServerIntegration?.({
				root: config.root,
				generatedDirectory: args.generatedDirectory,
			});
		},
		resolveId(id) {
			return serverIntegration?.resolveId(id);
		},
		load(id) {
			return serverIntegration?.load(id);
		},
		transform(code, id, options) {
			if (!serverIntegration || options?.ssr === false) return;
			return serverIntegration.transform(code, id);
		},
		generateBundle: {
			order: "post",
			async handler(_outputOptions, bundle) {
				const isClient =
					(
						this as typeof this & {
							environment: { config: { consumer?: "client" | "server" } };
						}
					).environment.config.consumer === "client";
				if (!isClient) {
					serverIntegration?.assertPatched();
					return;
				}
				if (!framework) {
					throw new Error(
						"experimentalPerLocaleBuild could not identify the active framework."
					);
				}
				const specialized = await specializePerLocaleBundle({
					bundle,
					layout: framework.layout,
					settings: await args.settings(),
					vite: await (args.loadVite ?? loadViteOxcApi)(),
				});
				for (const asset of specialized.assets) {
					this.emitFile({
						type: "asset",
						fileName: asset.fileName,
						source: asset.source,
					});
				}
				this.emitFile({
					type: "asset",
					fileName: PER_LOCALE_BUILD_MANIFEST,
					source: JSON.stringify(specialized.manifest, undefined, "\t") + "\n",
				});
			},
		},
	};
}

function assertSupportedClientBuild(
	build:
		| {
				minify?: unknown;
				sourcemap?: unknown;
		  }
		| undefined
): void {
	if (build?.minify === false || build?.sourcemap) {
		throw new Error(
			"experimentalPerLocaleBuild requires client minification and does not support client sourcemaps."
		);
	}
}
