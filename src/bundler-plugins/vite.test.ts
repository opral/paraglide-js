import {
	insertBundleNested,
	loadProjectInMemory,
	newProject,
	saveProjectToDirectory,
	type BundleNested,
	type InlangPlugin,
} from "@inlang/sdk";
import {
	mkdtemp,
	mkdir,
	readFile,
	rm,
	symlink,
	writeFile,
} from "node:fs/promises";
import nodeFs from "node:fs";
import { execFile } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { memfs } from "memfs";
import messageFormatPlugin from "@inlang/plugin-message-format";
import { build as viteBuild } from "vite";
import { expect, test } from "vitest";
import { perLocaleBuildStaticLocaleExpression } from "../compiler/per-locale-build.js";
import { paraglideVitePlugin } from "./vite.js";
import { createClientLocaleSplitPlugin } from "./client-locale-split/vite-plugin.js";

test("experimentalPerLocaleBuild generates locale source modules and installs the Vite environment orchestrator", async () => {
	const project = await loadProjectInMemory({
		blob: await newProject({
			settings: { baseLocale: "en", locales: ["en", "de"] },
		}),
	});
	const fs = memfs().fs as unknown as typeof import("node:fs");
	await saveProjectToDirectory({
		project,
		path: "/project.inlang",
		fs: fs.promises,
	});
	const plugins = paraglideVitePlugin({
		project: "/project.inlang",
		outdir: "/src/paraglide",
		fs,
		experimentalPerLocaleBuild: true,
		strategy: ["preferredLanguage", "baseLocale"],
		additionalFiles: { "custom.js": "export const custom = true;\n" },
	});
	if (!Array.isArray(plugins)) {
		throw new Error("Expected multiple Vite plugins");
	}
	expect(plugins.map((plugin) => plugin.name)).toEqual([
		"paraglide-config-discovery-root",
		"unplugin-paraglide-js",
		"paraglide-vite-locale-environments",
	]);

	const compiler = plugins[1]!;
	if (typeof compiler.buildStart !== "function") {
		throw new Error("Expected the compiler buildStart hook");
	}
	await compiler.buildStart.call({ addWatchFile() {} } as never, {} as never);

	expect(
		await fs.promises.readFile("/src/paraglide/messages/en.js", "utf8")
	).toBeDefined();
	expect(
		await fs.promises.readFile("/src/paraglide/messages/de.js", "utf8")
	).toBeDefined();
	expect(
		await fs.promises.readFile("/src/paraglide/runtime.js", "utf8")
	).toContain(perLocaleBuildStaticLocaleExpression);
	expect(
		await fs.promises.readFile("/src/paraglide/custom.js", "utf8")
	).toContain("export const custom = true;");
	await expect(
		fs.promises.readFile("/src/paraglide/tanstack-start.server.js", "utf8")
	).rejects.toThrow();
});

test("experimentalPerLocaleBuild rejects conflicting compiler options", () => {
	const common = { project: "/project.inlang", outdir: "/src/paraglide" };
	expect(() =>
		paraglideVitePlugin({
			...common,
			experimentalPerLocaleBuild: true,
			experimentalStaticLocale: '"de"',
		})
	).toThrow("cannot be combined with experimentalStaticLocale");
	expect(() =>
		paraglideVitePlugin({
			...common,
			experimentalPerLocaleBuild: true,
			experimentalMiddlewareLocaleSplitting: true,
		})
	).toThrow("cannot be combined with experimentalMiddlewareLocaleSplitting");
	expect(() =>
		paraglideVitePlugin({
			...common,
			experimentalPerLocaleBuild: true,
			outputStructure: "message-modules",
		})
	).toThrow('requires outputStructure: "locale-modules"');
	expect(() =>
		paraglideVitePlugin({
			...common,
			experimentalPerLocaleBuild: true,
			routeStrategies: [
				{
					match: "/api/:path(.*)?",
					exclude: true,
				},
			],
		})
	).not.toThrow();
});

test("experimentalClientLocaleSplit emits locale metadata and rewires only Vite client imports", async () => {
	const project = await loadProjectInMemory({
		blob: await newProject({
			settings: { baseLocale: "en", locales: ["en", "de"] },
		}),
	});
	const fs = memfs().fs as unknown as typeof import("node:fs");
	await saveProjectToDirectory({
		project,
		path: "/project.inlang",
		fs: fs.promises,
	});

	const plugins = paraglideVitePlugin({
		project: "/project.inlang",
		outdir: "/src/paraglide",
		fs,
		experimentalClientLocaleSplit: true,
	});
	expect(Array.isArray(plugins)).toBe(true);
	if (!Array.isArray(plugins))
		throw new Error("Expected Vite compiler and facade plugins");
	expect(plugins.map((plugin) => plugin.name)).toEqual([
		"unplugin-paraglide-js",
		"paraglide-vite-client-locale-split",
	]);
	const [compiler, split] = plugins as [any, any];
	const configResolved = split.configResolved as (config: unknown) => void;
	configResolved({
		command: "build",
		base: "/app/",
		build: { ssr: false, target: "es2022" },
	});
	await compiler.buildStart.call({ addWatchFile() {} });
	expect(split.buildStart.sequential).toBe(true);
	await split.buildStart.handler.call({
		addWatchFile() {},
		emitFile: () => "preload-entry",
	});

	const metadata = JSON.parse(
		await fs.promises.readFile(
			"/src/paraglide/client-locale-split.json",
			"utf8"
		)
	);
	expect(metadata).toMatchObject({ baseLocale: "en", locales: ["en", "de"] });
	expect(
		await fs.promises.readFile("/src/paraglide/locale-loader.js", "utf8")
	).toContain('@typedef {"en" | "de"} Locale');

	const resolveHook = split.resolveId.handler as (
		this: unknown,
		source: string,
		importer: string,
		options?: { ssr?: boolean }
	) => Promise<string | null>;
	const clientMessagesId = await resolveHook.call(
		{},
		"/src/paraglide/messages.js",
		"/app/src/main.js",
		{ ssr: false }
	);
	expect(clientMessagesId).toContain("client-locale-split:root");
	const aliasedMessagesId = await resolveHook.call(
		{
			resolve: async () => ({ id: "/src/paraglide/messages.js" }),
		},
		"@/paraglide/messages.js",
		"/app/src/main.js",
		{ ssr: false }
	);
	expect(aliasedMessagesId).toBe(clientMessagesId);
	const extensionlessMessagesId = await resolveHook.call(
		{
			resolve: async () => ({ id: "/src/paraglide/messages.js" }),
		},
		"@/paraglide/messages",
		"/app/src/main.js",
		{ ssr: false }
	);
	expect(extensionlessMessagesId).toBe(clientMessagesId);
	const relativeExtensionlessMessagesId = await resolveHook.call(
		{},
		"./messages",
		"/src/paraglide/consumer.js",
		{ ssr: false }
	);
	expect(relativeExtensionlessMessagesId).toBe(clientMessagesId);
	const ssrMessagesId = await resolveHook.call(
		{},
		"/src/paraglide/messages.js",
		"/app/src/main.js",
		{ ssr: true }
	);
	expect(ssrMessagesId).toBeNull();

	const rootCode = await split.load.call({}, clientMessagesId);
	expect(rootCode).toContain("await startupLocalePromise");
	expect(rootCode).not.toContain("export function loadLocale");
	const coreId = await resolveHook.call(
		{},
		"virtual:paraglide/client-locale-split/core",
		"/src/paraglide/messages.js",
		{ ssr: false }
	);
	const coreCode = await split.load.call({}, coreId);
	expect(coreCode).toContain('from "/src/paraglide/runtime.js"');
	expect(coreCode).toContain("!Array.isArray(messages)");
	expect(coreCode).toContain("if (intent !== latestLocaleIntent)");
	expect(coreCode).toContain("const messages = module.default");
	expect(coreCode).toContain("loadLocale(baseLocale)");
	expect(coreCode).toContain("]).then(() => undefined)");

	const localeId = await resolveHook.call(
		{},
		"virtual:paraglide/client-locale-split/locale/en",
		"/src/paraglide/messages.js",
		{ ssr: false }
	);
	const localeCode = await split.load.call({}, localeId);
	expect(localeCode).toBe("export default [];\n");

	const loaderId = await resolveHook.call(
		{},
		"/src/paraglide/locale-loader.js",
		"/app/src/main.js",
		{ ssr: false }
	);
	const loaderCode = await split.load.call({}, loaderId);
	expect(loaderCode).toContain("export { loadLocale }");
	expect(loaderCode).not.toContain("messages");

	const transformHtml = split.transformIndexHtml.handler as (
		html: string
	) => string;
	configResolved({
		command: "serve",
		base: "/nested/app/",
		build: { ssr: false, target: "es2022" },
	});
	expect(transformHtml("<html><head></head><body></body></html>")).toContain(
		'src="/nested/app/@id/__x00__paraglide:client-locale-split:preload"'
	);

	configResolved({
		command: "build",
		base: "https://cdn.example.com/nested/app/",
		build: { ssr: false, target: "es2022" },
	});
	const bundle: Record<string, any> = {
		"index.html": {
			type: "asset",
			fileName: "index.html",
			source: "<html><head></head><body></body></html>",
		},
	};
	const generateBundle = split.generateBundle.handler as (
		this: { getFileName: (referenceId: string) => string },
		options: unknown,
		bundle: Record<string, any>
	) => void;
	generateBundle.call(
		{ getFileName: () => "assets/paraglide-locale-preload.js" },
		{},
		bundle
	);
	expect(bundle["index.html"].source).toContain(
		'src="https://cdn.example.com/nested/app/assets/paraglide-locale-preload.js"'
	);
	await project.close();
});

test("experimentalClientLocaleSplit validates layout conflicts and top-level-await targets", () => {
	const common = {
		project: "/project.inlang",
		outdir: "/src/paraglide",
		experimentalClientLocaleSplit: true,
	};
	expect(() =>
		paraglideVitePlugin({ ...common, outputStructure: "message-modules" })
	).toThrow('requires outputStructure: "locale-modules"');
	expect(() =>
		paraglideVitePlugin({
			...common,
			experimentalMiddlewareLocaleSplitting: true,
		})
	).toThrow("cannot be combined with experimentalMiddlewareLocaleSplitting");
	expect(() =>
		paraglideVitePlugin({ ...common, experimentalStaticLocale: '"de"' })
	).toThrow("cannot be combined with experimentalStaticLocale");
	expect(() =>
		paraglideVitePlugin({ ...common, experimentalPerLocaleBuild: true })
	).toThrow("cannot be combined with experimentalPerLocaleBuild");

	const plugins = paraglideVitePlugin(common) as any[];
	expect(() =>
		plugins[1].configResolved({
			command: "build",
			base: "/",
			build: { ssr: false, target: "es2020" },
		})
	).toThrow("requires an explicit Vite build.target of es2022 or newer");
	expect(() =>
		plugins[1].configResolved({
			command: "build",
			base: "/",
			build: { ssr: false, target: ["es2022", "esnext"] },
		})
	).not.toThrow();
});

test("experimentalClientLocaleSplit rejects multiple Paraglide projects in one Vite config", () => {
	const makeSplitPlugin = (project: string, outdir: string) => {
		const plugins = paraglideVitePlugin({
			project,
			outdir,
			experimentalClientLocaleSplit: true,
		}) as any[];
		return plugins[1];
	};
	const first = makeSplitPlugin(
		"/app-one/project.inlang",
		"/app-one/paraglide"
	);
	const second = makeSplitPlugin(
		"/app-two/project.inlang",
		"/app-two/paraglide"
	);
	const resolvedConfig = {
		command: "build",
		base: "/",
		build: { ssr: false, target: "es2022" },
	};

	first.configResolved(resolvedConfig);
	expect(() => second.configResolved(resolvedConfig)).toThrow(
		"supports only one Paraglide project per Vite config because its virtual module IDs are shared"
	);
});

async function verifyClientLocaleSplitBuild(minify: boolean | undefined) {
	const root = await mkdtemp(join(tmpdir(), "paraglide-client-split-vite-"));
	let project: Awaited<ReturnType<typeof loadProjectInMemory>> | undefined;
	try {
		await symlink(
			resolve(process.cwd(), "node_modules"),
			join(root, "node_modules")
		);
		project = await loadProjectInMemory({
			blob: await newProject({
				settings: {
					baseLocale: "en",
					locales: ["en", "de"],
					modules: [
						"./node_modules/@inlang/plugin-message-format/dist/index.js",
					],
					"plugin.inlang.messageFormat": {
						pathPattern: "./messages/{locale}.json",
					},
				},
			}),
			providePlugins: [messageFormatPlugin as InlangPlugin],
		});
		await insertBundleNested(project.db, {
			id: "client_split_probe",
			declarations: [],
			messages: ["en", "de"].map((locale) => ({
				id: `client_split_probe_${locale}`,
				bundle_id: "client_split_probe",
				locale,
				selectors: [],
				variants: [
					{
						id: `client_split_probe_${locale}_variant`,
						message_id: "client_split_probe",
						matches: [],
						pattern: [
							{
								type: "text",
								value:
									locale === "en"
										? "CLIENT_SPLIT_EN_PROBE"
										: "CLIENT_SPLIT_DE_PROBE",
							},
						],
					},
				],
			})),
		} satisfies BundleNested);
		await saveProjectToDirectory({
			project,
			path: join(root, "project.inlang"),
			fs: nodeFs.promises,
		});
		await mkdir(join(root, "src"), { recursive: true });
		await writeFile(
			join(root, "index.html"),
			'<!doctype html><html><head></head><body><script type="module" src="/src/main.js"></script></body></html>'
		);
		await writeFile(
			join(root, "src/main.js"),
			'import { client_split_probe } from "./paraglide/messages.js"; document.body.textContent = client_split_probe();'
		);

		const plugins = paraglideVitePlugin({
			project: join(root, "project.inlang"),
			outdir: join(root, "src/paraglide"),
			experimentalClientLocaleSplit: true,
			strategy: ["globalVariable", "baseLocale"],
		});
		await viteBuild({
			configFile: false,
			logLevel: "silent",
			root,
			base: "/nested/app/",
			plugins: Array.isArray(plugins) ? plugins : [plugins],
			build: {
				target: "es2022",
				outDir: join(root, "dist"),
				manifest: true,
				minify,
			},
		});

		const html = await readFile(join(root, "dist/index.html"), "utf8");
		expect(html).toContain('src="/nested/app/assets/paraglide-locale-preload-');
		const manifest = JSON.parse(
			await readFile(join(root, "dist/.vite/manifest.json"), "utf8")
		) as Record<
			string,
			{ file: string; dynamicImports?: string[]; isEntry?: boolean }
		>;
		const entry = Object.values(manifest).find(
			(item) => item.isEntry && item.file.endsWith(".js")
		);
		const localeImportKeys = Object.entries(manifest).flatMap(([key, item]) =>
			item.dynamicImports?.length ? item.dynamicImports : []
		);
		expect(localeImportKeys.length).toBeGreaterThan(0);
		const entryCode = await readFile(join(root, "dist", entry!.file), "utf8");
		expect(entryCode).not.toContain("CLIENT_SPLIT_EN_PROBE");
		expect(entryCode).not.toContain("CLIENT_SPLIT_DE_PROBE");
		const dynamicCodes = await Promise.all(
			localeImportKeys.map(async (key) => {
				const chunk = manifest[key];
				return chunk ? readFile(join(root, "dist", chunk.file), "utf8") : "";
			})
		);
		expect(dynamicCodes.join("\n")).toContain("CLIENT_SPLIT_EN_PROBE");
		expect(dynamicCodes.join("\n")).toContain("CLIENT_SPLIT_DE_PROBE");
		if (minify === false) {
			// An older unminified build could cache ordinary output while the
			// client split flag was enabled, then fail without its metadata.
			const cacheDirectory = join(root, "project.inlang/cache/paraglide-js");
			for (const filename of await nodeFs.promises.readdir(cacheDirectory)) {
				const cachePath = join(cacheDirectory, filename);
				const cached = JSON.parse(await readFile(cachePath, "utf8"));
				delete cached.outputHashes["client-locale-split.json"];
				delete cached.outputHashes["locale-loader.js"];
				await writeFile(cachePath, JSON.stringify(cached));
			}
			await rm(join(root, "src/paraglide/client-locale-split.json"));
			await rm(join(root, "src/paraglide/locale-loader.js"));
			const restartedPlugins = paraglideVitePlugin({
				project: join(root, "project.inlang"),
				outdir: join(root, "src/paraglide"),
				experimentalClientLocaleSplit: true,
				strategy: ["globalVariable", "baseLocale"],
				// A new filesystem identity isolates warm state like a restart.
				fs: { ...nodeFs, promises: { ...nodeFs.promises } },
			});
			await viteBuild({
				configFile: false,
				logLevel: "silent",
				root,
				plugins: Array.isArray(restartedPlugins)
					? restartedPlugins
					: [restartedPlugins],
				build: {
					target: "es2022",
					minify: false,
					outDir: join(root, "retry-dist"),
				},
			});
			expect(
				JSON.parse(
					await readFile(
						join(root, "src/paraglide/client-locale-split.json"),
						"utf8"
					)
				).messages
			).toHaveLength(1);
		}
	} finally {
		await project?.close();
		await rm(root, { recursive: true, force: true });
	}
}

test.each([undefined, false])(
	"experimentalClientLocaleSplit builds real Vite locale chunks and a base-aware preload (minify=%s)",
	verifyClientLocaleSplitBuild
);

test("client locale facade preserves message API and regional fallback behavior", async () => {
	const outdir = await mkdtemp(join(tmpdir(), "paraglide-client-locale-then-"));
	try {
		await mkdir(join(outdir, "messages"));
		await writeFile(join(outdir, "package.json"), '{"type":"module"}');
		await writeFile(
			join(outdir, "client-locale-split.json"),
			JSON.stringify({
				baseLocale: "en",
				locales: ["en", "de", "de-AT"],
				messages: [
					{
						safeName: "_then",
						publicName: "then",
						hasInputs: false,
						hasMarkup: false,
					},
					{
						safeName: "helloworld2",
						publicName: "HelloWorld",
						hasInputs: false,
						hasMarkup: false,
						staticTexts: { en: "base uppercase", de: "German uppercase" },
					},
					{
						safeName: "loadlocale1",
						publicName: "loadLocale",
						hasInputs: false,
						hasMarkup: false,
					},
					{
						safeName: "with_inputs",
						publicName: "withInputs",
						hasInputs: true,
						hasMarkup: false,
					},
					{
						safeName: "rich",
						publicName: "rich",
						hasInputs: true,
						hasMarkup: true,
						staticTexts: { en: "base plain" },
					},
				],
			})
		);
		await writeFile(
			join(outdir, "messages", "en.js"),
			'export function then(resolve) { resolve("assimilated"); }\nexport const _then = () => "base then";\nexport const helloworld2 = () => "base uppercase";\nexport const loadlocale1 = () => "base loader message";\nexport const with_inputs = (inputs) => "base " + inputs.value;\nexport const rich = () => "base plain";\n'
		);
		await writeFile(
			join(outdir, "messages", "de.js"),
			'export function then(resolve) { resolve("assimilated"); }\nexport const _then = () => "German then";\nexport const helloworld2 = () => "German uppercase";\nexport const loadlocale1 = () => "German loader message";\nexport const with_inputs = (inputs) => "German " + inputs.value;\nexport const rich = Object.assign((inputs) => "German rich " + inputs.count, { parts: (inputs) => [{ type: "text", value: "German rich part " + inputs.count }] });\n'
		);
		await writeFile(
			join(outdir, "messages", "de-AT.js"),
			'export { _then, helloworld2, loadlocale1, with_inputs, rich } from "./de.js";\n'
		);
		await writeFile(
			join(outdir, "runtime.js"),
			'export const baseLocale = "en";\nlet activeLocale = "en";\nexport const getLocale = () => activeLocale;\nexport const toLocale = (value) => typeof value === "string" ? ({ en: "en", de: "de", "de-at": "de-AT" })[value.toLowerCase()] : undefined;\nexport let setLocale = (locale) => { activeLocale = locale; };\nexport const overwriteSetLocale = (fn) => { setLocale = fn; };\n'
		);

		const plugin = createClientLocaleSplitPlugin({
			state: { compilerOptions: { project: "unused", outdir } },
		});
		const rootCode = await (plugin.load as any).call(
			{},
			"\0paraglide:client-locale-split:root"
		);
		expect(rootCode).toContain('as "then"');
		expect(rootCode).toContain('as "HelloWorld"');
		expect(rootCode).toContain('as "loadLocale"');
		expect(rootCode).toContain('as "withInputs"');
		expect(rootCode).toContain("export { __paraglideMessages as m }");
		expect(rootCode).toContain("(inputs = {}, options = {}) =>");
		expect(rootCode).toContain("(inputs, options = {}) =>");
		expect(rootCode).toContain("options.locale");

		for (const locale of ["en", "de", "de-AT"]) {
			const localeId = `\0paraglide:client-locale-split:locale:${encodeURIComponent(locale)}`;
			const wrapperCode = await (plugin.load as any).call({}, localeId);
			expect(wrapperCode).toContain("export default [");
			expect(wrapperCode).not.toContain("import * as");
			if (locale !== "de-AT") {
				expect(wrapperCode).not.toContain("helloworld2 as");
				expect(wrapperCode).toContain(
					locale === "en" ? '"base uppercase"' : '"German uppercase"'
				);
			}
			await writeFile(join(outdir, `${locale}.wrapper.mjs`), wrapperCode);
		}
		let coreCode = await (plugin.load as any).call(
			{},
			"\0paraglide:client-locale-split:core"
		);
		for (const locale of ["en", "de", "de-AT"]) {
			coreCode = coreCode.replaceAll(
				JSON.stringify(
					`virtual:paraglide/client-locale-split/locale/${encodeURIComponent(locale)}`
				),
				JSON.stringify(
					pathToFileURL(join(outdir, `${locale}.wrapper.mjs`)).href
				)
			);
		}
		const corePath = join(outdir, "core.mjs");
		await writeFile(corePath, coreCode);
		const facadePath = join(outdir, "facade.mjs");
		await writeFile(
			facadePath,
			rootCode.replaceAll(
				JSON.stringify("virtual:paraglide/client-locale-split/core"),
				JSON.stringify(pathToFileURL(corePath).href)
			)
		);

		// A subprocess uses Node's native ESM loader rather than Vitest's module
		// runner, which otherwise masks Promise assimilation of the then export.
		const childSource = `
			import { then as thenMessage, HelloWorld, loadLocale as loadLocaleMessage, withInputs, rich, m } from ${JSON.stringify(pathToFileURL(facadePath).href)};
			import { setLocale, getLocale } from ${JSON.stringify(pathToFileURL(join(outdir, "runtime.js")).href)};
			await setLocale("DE-AT", { reload: false });
			let localeReads = 0;
			const getterOptions = { get locale() { localeReads++; return "de-AT"; } };
				rich({ count: 0 }, getterOptions);
			let nullOptionsThrows = false;
			try { rich({ count: 0 }, null); } catch (error) { nullOptionsThrows = error instanceof TypeError; }
			const descriptor = Object.getOwnPropertyDescriptor(rich, "parts");
			console.log(JSON.stringify({
				activeLocale: getLocale(),
				thenType: typeof thenMessage,
				thenValue: thenMessage(),
				uppercaseValue: HelloWorld(),
				loaderMessageValue: loadLocaleMessage(),
				inputValue: withInputs({ value: "input" }),
				functionLengths: [thenMessage.length, withInputs.length, rich.length, rich.parts.length],
				regionalRich: rich({ count: 2 }, { locale: "de-AT" }),
				regionalParts: rich.parts({ count: 2 }, { locale: "de-AT" }),
				unknownLocaleFallback: rich({ count: 3 }, { locale: "not-supported" }),
				nullLocaleUsesActive: rich({ count: 5 }, { locale: null }),
				staticParts: rich.parts({ count: 99 }, { locale: "en" }),
				getterReads: localeReads,
				nullOptionsThrows,
				partsEnumerable: descriptor.enumerable,
				partsWritable: descriptor.writable,
				mNamespaceNullPrototype: Object.getPrototypeOf(m) === null,
				mNamespaceFrozen: Object.isFrozen(m),
				mNamespaceWorks: m.rich({ count: 4 }, { locale: "de-AT" }),
			}));
		`;
		const { stdout } = await promisify(execFile)(
			process.execPath,
			["--input-type=module", "-e", childSource],
			{ timeout: 1000 }
		);
		const result = JSON.parse(stdout);
		expect(result).toMatchObject({
			activeLocale: "de-AT",
			thenType: "function",
			thenValue: "German then",
			uppercaseValue: "German uppercase",
			loaderMessageValue: "German loader message",
			inputValue: "German input",
			functionLengths: [0, 1, 1, 1],
			regionalRich: "German rich 2",
			regionalParts: [{ type: "text", value: "German rich part 2" }],
			unknownLocaleFallback: "base plain",
			nullLocaleUsesActive: "German rich 5",
			staticParts: [{ type: "text", value: "base plain" }],
			getterReads: 1,
			nullOptionsThrows: true,
			partsEnumerable: true,
			partsWritable: true,
			mNamespaceNullPrototype: true,
			mNamespaceFrozen: true,
			mNamespaceWorks: "German rich 4",
		});
	} finally {
		await rm(outdir, { recursive: true, force: true });
	}
});
