import { expect, test } from "vitest";
import type { OutputBundle } from "rolldown";
import { minify, transformWithOxc, version } from "vite";
import {
	PER_LOCALE_BUILD_DEFINE,
	PER_LOCALE_BUILD_MANIFEST,
} from "./constants.js";
import { detectPerLocaleBuildFramework } from "./frameworks/index.js";
import {
	createSvelteKitLayout,
	createSvelteKitServerIntegration,
	patchSvelteKitRenderModule,
} from "./frameworks/sveltekit.js";
import { createTanStackStartFramework } from "./frameworks/tanstack-start.js";
import {
	specializePerLocaleBundle,
	validatePerLocaleBuildSettings,
} from "./specialize-bundle.js";
import { createPerLocaleBuildVitePlugin } from "./vite-plugin.js";
import { getPerLocaleBuildLocaleId } from "./locale-id.js";
import { getPerLocaleBuildPrefix } from "./frameworks/tanstack-start.js";

const viteOxc = { version, minify, transformWithOxc };

test("specializes the canonical client and emits non-base assets with identical filenames", async () => {
	const bundle = createBundle({
		"assets/app-deadbeef.js": localeBranchFixture,
		"assets/app-deadbeef.css": "body { color: rebeccapurple }",
	});

	const result = await specializePerLocaleBundle({
		bundle,
		layout: createTanStackStartFramework().layout,
		settings: { baseLocale: "en", locales: ["en", "de"] },
		vite: viteOxc,
	});

	const canonical = bundle["assets/app-deadbeef.js"];
	expect(canonical?.type).toBe("chunk");
	if (canonical?.type !== "chunk") throw new Error("Expected a chunk");
	expect(canonical.code).toContain("__SENTINEL_EN__");
	expect(canonical.code).not.toContain("__SENTINEL_DE__");
	expect(canonical.code).not.toContain(PER_LOCALE_BUILD_DEFINE);

	const dePrefix = getPerLocaleBuildPrefix("de").replace(/^\//, "");
	const deChunk = result.assets.find(
		(asset) => asset.fileName === `${dePrefix}/assets/app-deadbeef.js`
	);
	expect(deChunk?.source.toString()).toContain("__SENTINEL_DE__");
	expect(deChunk?.source.toString()).not.toContain("__SENTINEL_EN__");
	expect(deChunk?.source.toString()).not.toContain(PER_LOCALE_BUILD_DEFINE);
	expect(
		result.assets.find(
			(asset) => asset.fileName === `${dePrefix}/assets/app-deadbeef.css`
		)?.source
	).toBe("body { color: rebeccapurple }");

	expect(result.manifest).toEqual({
		version: 1,
		baseLocale: "en",
		locales: {
			en: {
				prefix: "",
				assets: {
					"/assets/app-deadbeef.css": "/assets/app-deadbeef.css",
					"/assets/app-deadbeef.js": "/assets/app-deadbeef.js",
				},
			},
			de: {
				prefix: getPerLocaleBuildPrefix("de"),
				assets: {
					"/assets/app-deadbeef.css": `${getPerLocaleBuildPrefix("de")}/assets/app-deadbeef.css`,
					"/assets/app-deadbeef.js": `${getPerLocaleBuildPrefix("de")}/assets/app-deadbeef.js`,
				},
			},
		},
	});
});

test("keeps localized CSS references closed and canonicalizes public assets", async () => {
	const css = [
		'@import "../public-theme.css";',
		'@font-face { src: url("../public-font.woff2") }',
		".emitted { src: url(./emitted-font.woff2?#iefix) }",
		".external { src: url(https://cdn.example/font.woff2) }",
	].join("\n");
	const bundle = createBundle({
		"assets/app.js": localeBranchFixture,
		"assets/styles.css": css,
		"assets/emitted-font.woff2": "emitted-font",
	});

	const result = await specializePerLocaleBundle({
		bundle,
		layout: createTanStackStartFramework().layout,
		settings: { baseLocale: "en", locales: ["en", "de"] },
		vite: viteOxc,
	});

	const expected = [
		'@import "/public-theme.css";',
		'@font-face { src: url("/public-font.woff2") }',
		".emitted { src: url(./emitted-font.woff2?#iefix) }",
		".external { src: url(https://cdn.example/font.woff2) }",
	].join("\n");
	const canonicalCss = bundle["assets/styles.css"];
	expect(canonicalCss?.type).toBe("asset");
	if (canonicalCss?.type !== "asset") throw new Error("Expected CSS asset");
	expect(canonicalCss.source).toBe(expected);

	const dePrefix = getPerLocaleBuildPrefix("de").replace(/^\//, "");
	expect(
		result.assets.find(
			(asset) => asset.fileName === `${dePrefix}/assets/styles.css`
		)?.source
	).toBe(expected);
	expect(
		result.assets.find(
			(asset) => asset.fileName === `${dePrefix}/assets/emitted-font.woff2`
		)?.source
	).toBe("emitted-font");
});

test("keeps SvelteKit locale copies inside its immutable cache directory", async () => {
	const bundle = createBundle({
		"_app/immutable/entry/app.js": localeBranchFixture,
		"_app/immutable/assets/app.css":
			'body { background: url("../../../favicon.png") }',
		"_app/version.json": '{"version":"1"}',
	});
	const result = await specializePerLocaleBundle({
		bundle,
		layout: createSvelteKitLayout(),
		settings: { baseLocale: "en", locales: ["en", "de"] },
		vite: viteOxc,
	});
	const localizedRoot = "_app/immutable/__paraglide/de-6465";
	expect(
		result.assets
			.find((asset) => asset.fileName === `${localizedRoot}/entry/app.js`)
			?.source.toString()
	).toContain("__SENTINEL_DE__");
	expect(
		result.assets.find(
			(asset) => asset.fileName === `${localizedRoot}/assets/app.css`
		)?.source
	).toBe('body { background: url("/favicon.png") }');
	expect(
		result.assets.some((asset) => asset.fileName.includes("version.json"))
	).toBe(false);
	expect(result.manifest.locales.en).toEqual({
		prefix: "",
		assets: {
			"/_app/immutable/assets/app.css": "/_app/immutable/assets/app.css",
			"/_app/immutable/entry/app.js": "/_app/immutable/entry/app.js",
			"/_app/version.json": "/_app/version.json",
		},
	});
	expect(result.manifest.locales.de).toEqual({
		prefix: `/${localizedRoot}`,
		assets: {
			"/_app/immutable/assets/app.css": `/${localizedRoot}/assets/app.css`,
			"/_app/immutable/entry/app.js": `/${localizedRoot}/entry/app.js`,
			"/_app/version.json": "/_app/version.json",
		},
	});
});

test("non-base JavaScript copies are emitted as assets, not entry chunks", async () => {
	const plugin = createPerLocaleBuildVitePlugin({
		settings: async () => ({ baseLocale: "en", locales: ["en", "de"] }),
		generatedDirectory: "src/paraglide",
		loadVite: async () => viteOxc,
	});
	const emitted: Array<Record<string, unknown>> = [];
	const warnings: string[] = [];
	const generateBundle = plugin.generateBundle;
	if (!generateBundle || typeof generateBundle === "function") {
		throw new Error("Expected an ordered generateBundle hook");
	}
	if (typeof plugin.configResolved !== "function") {
		throw new Error("Expected configResolved hook");
	}
	plugin.configResolved.call(
		{} as never,
		{
			plugins: [{ name: "tanstack-start-core:config" }],
			define: {},
			build: { ssr: false },
		} as never
	);

	await generateBundle.handler.call(
		{
			environment: { config: { consumer: "client" } },
			emitFile(file: Record<string, unknown>) {
				emitted.push(file);
				return "reference-id";
			},
			warn(message: string) {
				warnings.push(message);
			},
		} as never,
		{} as never,
		createBundle({ "assets/app.js": localeBranchFixture }) as never,
		false
	);

	const localizedJs = emitted.find(
		(file) =>
			typeof file.fileName === "string" && file.fileName.endsWith("/app.js")
	);
	expect(localizedJs).toMatchObject({ type: "asset" });
	expect(localizedJs).not.toHaveProperty("isEntry");
	expect(emitted).toContainEqual(
		expect.objectContaining({
			type: "asset",
			fileName: PER_LOCALE_BUILD_MANIFEST,
		})
	);
	const emittedManifest = emitted.find(
		(file) => file.fileName === PER_LOCALE_BUILD_MANIFEST
	);
	expect(
		JSON.parse(String(emittedManifest?.source)) as Record<string, unknown>
	).toMatchObject({
		version: 1,
		baseLocale: "en",
		locales: {
			en: { prefix: "" },
			de: { prefix: "/__paraglide/de-6465" },
		},
	});
	expect(warnings).toEqual([]);
});

test("configures locale-safe asset URLs and reserves final minification", async () => {
	const plugin = createPerLocaleBuildVitePlugin({
		settings: async () => ({ baseLocale: "en", locales: ["en"] }),
		generatedDirectory: "src/paraglide",
	});
	const config = plugin.config;
	const configEnvironment = plugin.configEnvironment;
	if (
		!config ||
		typeof config !== "function" ||
		!configEnvironment ||
		typeof configEnvironment !== "function"
	) {
		throw new Error("Expected Vite config hooks");
	}
	expect(() =>
		config.call({} as never, { base: "/app/" }, { command: "build" } as never)
	).toThrow("custom Vite base");
	expect(() =>
		config.call({} as never, { build: { minify: false } }, {
			command: "build",
		} as never)
	).toThrow("requires client minification");
	expect(() =>
		config.call({} as never, { build: { sourcemap: true } }, {
			command: "build",
		} as never)
	).toThrow("does not support client sourcemaps");
	const configured = await config.call({} as never, {}, {
		command: "build",
	} as never);
	if (!configured) throw new Error("Expected a Vite config result");
	expect(configured).toMatchObject({ base: "" });
	const renderBuiltUrl = configured?.experimental?.renderBuiltUrl;
	if (!renderBuiltUrl) throw new Error("Expected renderBuiltUrl");
	expect(
		renderBuiltUrl("assets/styles.css", {
			type: "asset",
			hostId: "server.js",
			hostType: "js",
			ssr: true,
		})
	).toBe("/assets/styles.css");
	expect(
		renderBuiltUrl("assets/app.js", {
			type: "asset",
			hostId: "index.html",
			hostType: "html",
			ssr: false,
		})
	).toEqual({ relative: true });
	expect(() =>
		config.call(
			{} as never,
			{
				experimental: {
					renderBuiltUrl: () => "https://cdn.example/asset.js",
				},
			},
			{ command: "build" } as never
		)
	).toThrow("cannot be combined with experimental.renderBuiltUrl");
	expect(() =>
		configEnvironment.call(
			{} as never,
			"client",
			{ consumer: "client", build: { minify: "oxc", sourcemap: true } },
			{ command: "build" } as never
		)
	).toThrow("does not support client sourcemaps");
	expect(() =>
		configEnvironment.call(
			{} as never,
			"client",
			{ consumer: "client", build: { minify: false } },
			{ command: "build" } as never
		)
	).toThrow("requires client minification");
	expect(
		configEnvironment.call(
			{} as never,
			"client",
			{ build: { minify: "oxc" } },
			{ command: "build" } as never
		)
	).toEqual({ build: { minify: false, sourcemap: false } });
	expect(
		configEnvironment.call({} as never, "ssr", { consumer: "server" }, {
			command: "build",
		} as never)
	).toEqual({ define: { [PER_LOCALE_BUILD_DEFINE]: "undefined" } });
	expect(
		configEnvironment.call({} as never, "client", { consumer: "client" }, {
			command: "serve",
		} as never)
	).toEqual({ define: { [PER_LOCALE_BUILD_DEFINE]: "undefined" } });
});

test.each(["7.3.0", "9.0.0"])(
	"rejects unsupported Vite %s",
	async (version) => {
		await expect(
			specializePerLocaleBundle({
				bundle: createBundle({ "app.js": localeBranchFixture }),
				layout: createTanStackStartFramework().layout,
				settings: { baseLocale: "en", locales: ["en"] },
				vite: {
					...viteOxc,
					version,
				},
			})
		).rejects.toThrow("requires Vite 8");
	}
);

test("detects TanStack Start and SvelteKit and rejects unsupported frameworks", () => {
	expect(
		detectPerLocaleBuildFramework({
			plugins: [{ name: "tanstack-start-core:config" }],
			define: {},
		} as never)
	).toHaveProperty("layout");
	const svelteSetup = createSvelteKitSetup();
	const svelte = detectPerLocaleBuildFramework({
		plugins: [svelteSetup],
		define: { __SVELTEKIT_APP_DIR__: '"_app"' },
	} as never);
	expect(svelte.layout).toBeDefined();
	expect(() =>
		detectPerLocaleBuildFramework({
			plugins: [{ name: "vite-plugin-svelte" }],
			define: {},
		} as never)
	).toThrow("supports TanStack Start and SvelteKit");
	expect(() =>
		detectPerLocaleBuildFramework({
			plugins: [svelteSetup, { name: "tanstack-start-core:config" }],
			define: {},
		} as never)
	).toThrow("both TanStack Start and SvelteKit");
	for (const unsupported of [
		{ appDir: "app" },
		{ paths: { base: "/docs", assets: "" } },
		{ output: { bundleStrategy: "inline" } },
		{ router: { resolution: "server" } },
		{ files: { serviceWorker: new URL(import.meta.url).pathname } },
	]) {
		expect(() =>
			detectPerLocaleBuildFramework({
				plugins: [createSvelteKitSetup(unsupported)],
				define: {},
			} as never)
		).toThrow("supports only the tested SvelteKit 2.69.x defaults");
	}

	const plugin = createPerLocaleBuildVitePlugin({
		settings: async () => ({ baseLocale: "en", locales: ["en"] }),
		generatedDirectory: "src/paraglide",
	});
	const configResolved = plugin.configResolved;
	if (!configResolved || typeof configResolved !== "function") {
		throw new Error("Expected configResolved hook");
	}

	expect(() =>
		configResolved.call({} as never, { plugins: [] } as never)
	).toThrow("supports TanStack Start and SvelteKit");
});

test("guards multi-locale SvelteKit SPA fallbacks in the virtual adapter", async () => {
	const plugin = createPerLocaleBuildVitePlugin({
		settings: async () => ({ baseLocale: "en", locales: ["en", "de"] }),
		generatedDirectory: "src/paraglide",
	});
	if (typeof plugin.configResolved !== "function") {
		throw new Error("Expected configResolved hook");
	}
	plugin.configResolved.call(
		{} as never,
		{
			root: "/app",
			plugins: [createSvelteKitSetup()],
			define: { __SVELTEKIT_APP_DIR__: '"_app"' },
			build: { ssr: true },
		} as never
	);
	if (typeof plugin.load !== "function") {
		throw new Error("Expected load hook");
	}
	const source = await plugin.load.call(
		{} as never,
		"\0virtual:paraglide-per-locale-build/sveltekit"
	);
	expect(source).toContain("locales.length > 1");
	expect(source).toContain("does not support SvelteKit SPA fallback pages");
	expect(source).toContain('marker + "__paraglide/" + getLocaleId(locale)');
	expect(source).not.toContain("per-locale-build.js");
	if (typeof source !== "string") throw new Error("Expected virtual source");
	const executableSource = source.replace(
		/^import .*;$/m,
		'const baseLocale = "en"; const locales = ["en", "de"]; let currentLocale = "de"; const getLocale = () => currentLocale; export const setTestLocale = (locale) => currentLocale = locale;'
	);
	const virtualModule = (await import(
		`data:text/javascript;base64,${Buffer.from(executableSource).toString("base64")}`
	)) as {
		localizeSvelteKitAssetPath: (path: string) => string;
		setTestLocale: (locale: string) => void;
	};
	const localized = `_app/immutable/__paraglide/${getPerLocaleBuildLocaleId("de")}/chunks/app.js`;
	expect(
		virtualModule.localizeSvelteKitAssetPath("_app/immutable/chunks/app.js")
	).toBe(localized);
	expect(virtualModule.localizeSvelteKitAssetPath(localized)).toBe(localized);
	expect(virtualModule.localizeSvelteKitAssetPath("favicon.png")).toBe(
		"favicon.png"
	);
	virtualModule.setTestLocale("en");
	expect(
		virtualModule.localizeSvelteKitAssetPath("_app/immutable/chunks/app.js")
	).toBe("_app/immutable/chunks/app.js");
	for (const locale of ["pt-BR", "中文", "en/us", "en?us"]) {
		virtualModule.setTestLocale(locale);
		expect(
			virtualModule.localizeSvelteKitAssetPath("_app/immutable/chunks/app.js")
		).toBe(
			`_app/immutable/__paraglide/${getPerLocaleBuildLocaleId(locale)}/chunks/app.js`
		);
	}
});

test("patches SvelteKit asset rendering before preload and CSP generation", () => {
	const render = patchSvelteKitRenderModule(`
export async function render_response({ state }) {
	if (state.prerendering) {
		state.prerendering = true;
	}
const prefixed = (path) => {
	return path;
};
}
`);
	expect(render).toContain(SVELTEKIT_VIRTUAL_IMPORT_SNIPPET);
	expect(render).toContain(
		"path = __paraglideLocalizeSvelteKitAssetPath(path);"
	);
	expect(render).toContain(
		"__paraglideAssertSvelteKitPerLocaleFallbackSupported(state.prerendering?.fallback)"
	);
	expect(() => patchSvelteKitRenderModule("const changed = true;")).toThrow(
		"differs from the tested SvelteKit 2.69.x"
	);
});

test("requires the tested SvelteKit render module to be patched", () => {
	const integration = createSvelteKitServerIntegration({
		root: "/app",
		generatedDirectory: "src/paraglide",
	});
	expect(() => integration.assertPatched()).toThrow(
		"server rendering internals were not found"
	);
	integration.transform(
		`export async function render_response({ state }) {
	if (state.prerendering) {}
	const prefixed = (path) => {
		return path;
	};
}`,
		"/node_modules/@sveltejs/kit/src/runtime/server/page/render.js"
	);
	expect(() => integration.assertPatched()).not.toThrow();
});

test("validates project locale invariants", () => {
	expect(() =>
		validatePerLocaleBuildSettings({ baseLocale: "en", locales: ["de"] })
	).toThrow("is not present");
	expect(() =>
		validatePerLocaleBuildSettings({
			baseLocale: "en",
			locales: ["en", "en"],
		})
	).toThrow("unique");
});

function createBundle(files: Record<string, string>): OutputBundle {
	return Object.fromEntries(
		Object.entries(files).map(([fileName, source]) => {
			if (fileName.endsWith(".js")) {
				return [
					fileName,
					{
						type: "chunk",
						fileName,
						name: "app",
						code: source,
						map: null,
						imports: [],
						dynamicImports: [],
						exports: ["message"],
						facadeModuleId: "/src/app.js",
						isEntry: true,
						isDynamicEntry: false,
						moduleIds: ["/src/app.js"],
						modules: {},
						preliminaryFileName: fileName,
						sourcemapFileName: null,
					},
				];
			}
			return [
				fileName,
				{
					type: "asset",
					fileName,
					name: fileName,
					names: [fileName],
					originalFileName: null,
					originalFileNames: [],
					source,
				},
			];
		})
	) as unknown as OutputBundle;
}

function createSvelteKitSetup(overrides: Record<string, unknown> = {}) {
	return {
		name: "vite-plugin-sveltekit-setup",
		api: {
			options: {
				kit: {
					appDir: "_app",
					output: { bundleStrategy: "split" },
					paths: { base: "", assets: "" },
					router: { resolution: "client" },
					...overrides,
				},
			},
		},
	};
}

const localeBranchFixture = `
const staticLocaleInput = ${PER_LOCALE_BUILD_DEFINE};
const staticLocale = staticLocaleInput === undefined
	? undefined
	: staticLocaleInput === "en"
		? "en"
		: staticLocaleInput === "de"
			? "de"
			: staticLocaleInput;
const en = () => "__SENTINEL_EN__";
const de = () => "__SENTINEL_DE__";
export const message = () => {
	if (${PER_LOCALE_BUILD_DEFINE} === "en") return en();
	if (${PER_LOCALE_BUILD_DEFINE} === "de") return de();
	const locale = staticLocale ?? "en";
	if (locale === "en") return en();
	return de();
};
`;

const SVELTEKIT_VIRTUAL_IMPORT_SNIPPET =
	"virtual:paraglide-per-locale-build/sveltekit";
