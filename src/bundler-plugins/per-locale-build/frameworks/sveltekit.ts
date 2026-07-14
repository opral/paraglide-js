import type { Plugin, ResolvedConfig } from "vite";
import nodeFs from "node:fs";
import path from "node:path";
import type {
	PerLocaleBuildFramework,
	PerLocaleBuildLayout,
	PerLocaleBuildServerIntegration,
} from "../types.js";
import { getPerLocaleBuildLocaleId } from "../locale-id.js";

export const SVELTEKIT_VIRTUAL_MODULE_ID =
	"virtual:paraglide-per-locale-build/sveltekit";
export const RESOLVED_SVELTEKIT_VIRTUAL_MODULE_ID =
	"\0virtual:paraglide-per-locale-build/sveltekit";

type SvelteKitSetupPlugin = Plugin & {
	api?: {
		options?: {
			kit?: {
				appDir?: string;
				files?: { serviceWorker?: string };
				output?: { bundleStrategy?: string };
				paths?: { assets?: string; base?: string };
				router?: { resolution?: string };
			};
		};
	};
};

export function hasSvelteKitSetupPlugin(
	config: Pick<ResolvedConfig, "plugins">
): boolean {
	return config.plugins.some(
		(plugin) => plugin.name === "vite-plugin-sveltekit-setup"
	);
}

/** Early config-hook detection before SvelteKit's validated plugin API is available. */
export function hasSvelteKitConfig(config: {
	define?: Record<string, unknown>;
}): boolean {
	return Object.hasOwn(config.define ?? {}, "__SVELTEKIT_APP_DIR__");
}

export function createSvelteKitFramework(
	config: Pick<ResolvedConfig, "plugins">
): PerLocaleBuildFramework {
	const setupPlugin = config.plugins.find(
		(plugin) => plugin.name === "vite-plugin-sveltekit-setup"
	) as SvelteKitSetupPlugin | undefined;
	const kit = setupPlugin?.api?.options?.kit;
	if (!kit) {
		throw new Error(
			"experimentalPerLocaleBuild is currently tested with SvelteKit 2.69.x and requires its validated Vite plugin configuration."
		);
	}
	if (
		kit.appDir !== "_app" ||
		kit.paths?.base ||
		kit.paths?.assets ||
		kit.output?.bundleStrategy !== "split" ||
		kit.router?.resolution !== "client" ||
		(kit.files?.serviceWorker && svelteKitEntryExists(kit.files.serviceWorker))
	) {
		throw new Error(
			'experimentalPerLocaleBuild currently supports only the tested SvelteKit 2.69.x defaults: kit.appDir="_app", empty kit.paths.base/assets, kit.output.bundleStrategy="split", kit.router.resolution="client", and no service worker.'
		);
	}
	return {
		layout: createSvelteKitLayout(),
		createServerIntegration({ root, generatedDirectory }) {
			return createSvelteKitServerIntegration({
				root,
				generatedDirectory,
			});
		},
	};
}

export function createSvelteKitLayout(): PerLocaleBuildLayout {
	const immutablePrefix = "_app/immutable/";
	return {
		validateOutput(fileName, type) {
			if (type === "chunk" && !fileName.startsWith(immutablePrefix)) {
				throw new Error(
					`experimentalPerLocaleBuild expected every SvelteKit client chunk below ${JSON.stringify(immutablePrefix)}, but found ${JSON.stringify(fileName)}. Only the tested SvelteKit 2.69.x default client output is supported.`
				);
			}
		},
		getLocalePrefix(locale, baseLocale) {
			return locale === baseLocale
				? ""
				: `/_app/immutable/__paraglide/${getPerLocaleBuildLocaleId(locale)}`;
		},
		getLocalizedFileName(fileName, locale, baseLocale) {
			if (locale === baseLocale || !fileName.startsWith(immutablePrefix)) {
				return fileName;
			}
			return `${immutablePrefix}__paraglide/${getPerLocaleBuildLocaleId(locale)}/${fileName.slice(immutablePrefix.length)}`;
		},
	};
}

export function createSvelteKitServerIntegration(args: {
	root: string;
	generatedDirectory: string;
}): PerLocaleBuildServerIntegration {
	let renderPatched = false;

	return {
		resolveId(id: string): string | undefined {
			return id === SVELTEKIT_VIRTUAL_MODULE_ID
				? RESOLVED_SVELTEKIT_VIRTUAL_MODULE_ID
				: undefined;
		},
		load(id: string): string | undefined {
			if (id !== RESOLVED_SVELTEKIT_VIRTUAL_MODULE_ID) return;
			return createSvelteKitVirtualModuleSource(args);
		},
		transform(
			code: string,
			id: string
		): { code: string; map: null } | undefined {
			const normalizedId = normalizeModuleId(id.split("?", 1)[0] ?? id);
			if (
				normalizedId.endsWith(
					"/@sveltejs/kit/src/runtime/server/page/render.js"
				)
			) {
				renderPatched = true;
				return { code: patchSvelteKitRenderModule(code), map: null };
			}
			return undefined;
		},
		assertPatched(): void {
			if (!renderPatched) {
				throw new Error(
					"experimentalPerLocaleBuild could not integrate with SvelteKit because its tested 2.69.x server rendering internals were not found."
				);
			}
		},
	};
}

export function createSvelteKitVirtualModuleSource(args: {
	root: string;
	generatedDirectory: string;
}): string {
	const generatedDirectory = path.resolve(args.root, args.generatedDirectory);
	const runtimeModule = normalizeModuleId(
		path.join(generatedDirectory, "runtime.js")
	);
	return [
		`import { baseLocale, getLocale, locales } from ${JSON.stringify(runtimeModule)};`,
		`const getLocaleId = ${getPerLocaleBuildLocaleId.toString()};`,
		"export function localizeSvelteKitAssetPath(path) {",
		"\tconst locale = getLocale();",
		"\tif (locale === baseLocale) return path;",
		'\tconst marker = "_app/immutable/";',
		"\tif (!path.includes(marker)) return path;",
		'\tconst localizedMarker = marker + "__paraglide/" + getLocaleId(locale) + "/";',
		"\treturn path.includes(localizedMarker)",
		"\t\t? path",
		"\t\t: path.replace(marker, localizedMarker);",
		"}",
		"export function assertSvelteKitPerLocaleFallbackSupported(fallback) {",
		"\tif (fallback && locales.length > 1) {",
		'\t\tthrow new Error("experimentalPerLocaleBuild does not support SvelteKit SPA fallback pages because one fallback cannot select a request-locale client graph. Use SSR or prerender every locale-specific page.");',
		"\t}",
		"}",
		"",
	].join("\n");
}

export function patchSvelteKitRenderModule(code: string): string {
	const marker = "const prefixed = (path) => {";
	const renderResponseMarker = "}) {\n\tif (state.prerendering) {";
	assertSingleSvelteKitMarker(code, marker, "server/page/render.js");
	assertSingleSvelteKitMarker(
		code,
		renderResponseMarker,
		"server/page/render.js"
	);
	return `${svelteKitVirtualImport}\n${code
		.replace(
			renderResponseMarker,
			`}) {\n\t__paraglideAssertSvelteKitPerLocaleFallbackSupported(state.prerendering?.fallback);\n\n\tif (state.prerendering) {`
		)
		.replace(
			marker,
			`${marker}\n\t\tpath = __paraglideLocalizeSvelteKitAssetPath(path);`
		)}`;
}

const svelteKitVirtualImport = `import { assertSvelteKitPerLocaleFallbackSupported as __paraglideAssertSvelteKitPerLocaleFallbackSupported, localizeSvelteKitAssetPath as __paraglideLocalizeSvelteKitAssetPath } from ${JSON.stringify(SVELTEKIT_VIRTUAL_MODULE_ID)};`;

function assertSingleSvelteKitMarker(
	code: string,
	marker: string,
	moduleName: string
): void {
	if (code.split(marker).length !== 2) {
		throw new Error(
			`experimentalPerLocaleBuild cannot patch this SvelteKit ${moduleName}; its internal asset rendering differs from the tested SvelteKit 2.69.x implementation.`
		);
	}
}

function normalizeModuleId(id: string): string {
	return id.replaceAll("\\", "/");
}

function svelteKitEntryExists(entry: string): boolean {
	return [
		entry,
		`${entry}.js`,
		`${entry}.ts`,
		path.join(entry, "index.js"),
		path.join(entry, "index.ts"),
	].some(
		(candidate) =>
			nodeFs.existsSync(candidate) && nodeFs.statSync(candidate).isFile()
	);
}
