import nodeFs from "node:fs/promises";
import nodeSyncFs from "node:fs";
import nodeOs from "node:os";
import nodePath from "node:path";
import {
	insertBundleNested,
	loadProjectInMemory,
	newProject,
	type BundleNested,
} from "@inlang/sdk";
import { createBuilder, createServer } from "vite";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { expect, test, vi } from "vitest";
import { compileProject } from "../../compiler/compile-project.js";
import { perLocaleBuildStaticLocaleExpression } from "../../compiler/per-locale-build.js";
import {
	createViteLocaleBuildPlan,
	createViteLocaleEnvironmentPlugin,
	type ViteLocaleBuildManifest,
	VITE_LOCALE_BUILD_MANIFEST,
} from "./vite-environments.js";

test("creates deterministic locale environment names and output directories", () => {
	expect(
		createViteLocaleBuildPlan({
			settings: {
				baseLocale: "en",
				locales: ["en", "zh-Hant"],
			},
			outputDirectory: "build",
		})
	).toEqual({
		outputDirectory: "build",
		variants: [
			{
				locale: "en",
				environmentName: "paraglide_client_en_656e",
				directory: "__paraglide/en-656e",
				outputDirectory: "build/__paraglide/en-656e",
				define: {
					"globalThis.__PARAGLIDE_STATIC_LOCALE__": '"en"',
				},
			},
			{
				locale: "zh-Hant",
				environmentName: "paraglide_client_zh_Hant_7a682d48616e74",
				directory: "__paraglide/zh-Hant-7a682d48616e74",
				outputDirectory: "build/__paraglide/zh-Hant-7a682d48616e74",
				define: {
					"globalThis.__PARAGLIDE_STATIC_LOCALE__": '"zh-Hant"',
				},
			},
		],
	});
	expect(() =>
		createViteLocaleBuildPlan({
			settings: { baseLocale: "en", locales: ["en"] },
			outputDirectory: "../outside",
		})
	).toThrow("must be a project-relative directory");
});

test("builds closed, source-mapped Rolldown graphs without post-processing", async () => {
	const temporaryRoot = await nodeFs.mkdtemp(
		nodePath.join(nodeOs.tmpdir(), "paraglide-vite-environments-")
	);
	const root = await nodeFs.realpath(temporaryRoot);
	try {
		await nodeFs.mkdir(nodePath.join(root, "src/messages"), {
			recursive: true,
		});
		await Promise.all([
			nodeFs.writeFile(
				nodePath.join(root, "index.html"),
				'<main id="app"></main><script type="module" src="./src/main.js"></script>\n'
			),
			nodeFs.writeFile(
				nodePath.join(root, "src/main.js"),
				[
					'import "./style.css";',
					'import "external-dependency";',
					'import { message, loadLazy } from "./messages/_index.js";',
					'document.querySelector("#app").textContent = message;',
					"loadLazy().then((module) => module.mount());",
					"",
				].join("\n")
			),
			nodeFs.writeFile(
				nodePath.join(root, "src/messages/_index.js"),
				[
					"  const locale = globalThis.__PARAGLIDE_STATIC_LOCALE__;",
					'import * as en from "./en.js";',
					'import * as de from "./de.js";',
					"export const message = locale === 'en' ? en.message : de.message;",
					"export const loadLazy = locale === 'en'",
					'  ? () => import("./en-lazy.js")',
					'  : () => import("./de-lazy.js");',
					"",
				].join("\n")
			),
			nodeFs.writeFile(
				nodePath.join(root, "src/messages/en.js"),
				'export const message = "EN_ONLY_MESSAGE";\n'
			),
			nodeFs.writeFile(
				nodePath.join(root, "src/messages/de.js"),
				'export const message = "DE_ONLY_MESSAGE";\n'
			),
			nodeFs.writeFile(
				nodePath.join(root, "src/messages/en-lazy.js"),
				'export function mount() { document.body.dataset.lazy = "EN_ONLY_LAZY"; }\n'
			),
			nodeFs.writeFile(
				nodePath.join(root, "src/messages/de-lazy.js"),
				'export function mount() { document.body.dataset.lazy = "DE_ONLY_LAZY"; }\n'
			),
			nodeFs.writeFile(
				nodePath.join(root, "src/style.css"),
				"#app { color: rebeccapurple; }\n"
			),
		]);
		await nodeFs.mkdir(
			nodePath.join(root, "build/__paraglide/removed-locale"),
			{ recursive: true }
		);
		await Promise.all([
			nodeFs.writeFile(
				nodePath.join(root, "build/__paraglide/removed-locale/stale.js"),
				"stale"
			),
			nodeFs.writeFile(
				nodePath.join(root, "build", VITE_LOCALE_BUILD_MANIFEST),
				'{"stale":true}\n'
			),
		]);

		let renderBuiltUrlCalls = 0;
		const builder = await createBuilder({
			configFile: false,
			root,
			base: "./",
			logLevel: "silent",
			experimental: {
				renderBuiltUrl() {
					renderBuiltUrlCalls += 1;
					return { relative: true };
				},
			},
			build: {
				outDir: "build",
				minify: false,
				sourcemap: true,
				rolldownOptions: {
					external: ["external-dependency"],
					output: {
						entryFileNames: "custom/[name]-[hash].js",
					},
				},
			},
			plugins: [
				createViteLocaleEnvironmentPlugin({
					settings: async () => ({
						baseLocale: "en",
						locales: ["en", "de"],
					}),
				}),
			],
		});
		await builder.buildApp();

		const outputRoot = nodePath.join(root, "build");
		const manifest = JSON.parse(
			await nodeFs.readFile(
				nodePath.join(outputRoot, VITE_LOCALE_BUILD_MANIFEST),
				"utf8"
			)
		) as ViteLocaleBuildManifest;
		expect(manifest.backend).toBe("vite-rolldown-environments");
		expect(Object.keys(manifest.locales)).toEqual(["en", "de"]);
		expect(renderBuiltUrlCalls).toBeGreaterThan(0);
		await expect(
			nodeFs.access(
				nodePath.join(outputRoot, "__paraglide/removed-locale/stale.js")
			)
		).rejects.toThrow();

		for (const locale of ["en", "de"] as const) {
			const localeManifest = manifest.locales[locale]!;
			expect(localeManifest.directory).toMatch(
				new RegExp(`^__paraglide/${locale}-`)
			);
			expect(localeManifest.files.some((file) => file.entry)).toBe(true);
			expect(
				localeManifest.files.some(
					(file) => file.entry && file.fileName.startsWith("custom/")
				)
			).toBe(true);
			expect(
				localeManifest.files.some((file) =>
					file.externalImports?.includes("external-dependency")
				)
			).toBe(true);
			expect(
				localeManifest.files.some((file) => file.fileName.endsWith(".map"))
			).toBe(true);

			const names = new Set(localeManifest.files.map((file) => file.fileName));
			for (const file of localeManifest.files) {
				for (const imported of [
					...(file.imports ?? []),
					...(file.dynamicImports ?? []),
				]) {
					expect(names.has(imported)).toBe(true);
				}
				const bytes = (
					await nodeFs.readFile(
						nodePath.join(outputRoot, localeManifest.directory, file.fileName)
					)
				).byteLength;
				expect(bytes).toBe(file.bytes);
			}
		}

		const enJavaScript = await readJavaScriptGraph(
			outputRoot,
			manifest.locales.en!
		);
		const deJavaScript = await readJavaScriptGraph(
			outputRoot,
			manifest.locales.de!
		);
		expect(enJavaScript).toContain("EN_ONLY_MESSAGE");
		expect(enJavaScript).toContain("EN_ONLY_LAZY");
		expect(enJavaScript).not.toContain("DE_ONLY_MESSAGE");
		expect(enJavaScript).not.toContain("DE_ONLY_LAZY");
		expect(deJavaScript).toContain("DE_ONLY_MESSAGE");
		expect(deJavaScript).toContain("DE_ONLY_LAZY");
		expect(deJavaScript).not.toContain("EN_ONLY_MESSAGE");
		expect(deJavaScript).not.toContain("EN_ONLY_LAZY");

		const enSourceMaps = await readSourceMaps(outputRoot, manifest.locales.en!);
		const deSourceMaps = await readSourceMaps(outputRoot, manifest.locales.de!);
		expect(enSourceMaps).not.toContain("DE_ONLY_MESSAGE");
		expect(enSourceMaps).not.toContain("DE_ONLY_LAZY");
		expect(deSourceMaps).not.toContain("EN_ONLY_MESSAGE");
		expect(deSourceMaps).not.toContain("EN_ONLY_LAZY");
	} finally {
		await nodeFs.rm(temporaryRoot, { recursive: true, force: true });
	}
});

test("keeps compiled Paraglide translations out of other locale source maps", async () => {
	const temporaryRoot = await nodeFs.mkdtemp(
		nodePath.join(nodeOs.tmpdir(), "paraglide-vite-compiled-")
	);
	const root = await nodeFs.realpath(temporaryRoot);
	const project = await loadProjectInMemory({
		blob: await newProject({
			settings: { baseLocale: "en", locales: ["en", "de"] },
		}),
	});
	try {
		await insertBundleNested(project.db, {
			id: "greeting",
			declarations: [],
			messages: [
				createMessage("en", "EN_COMPILED_TRANSLATION"),
				createMessage("de", "DE_COMPILED_TRANSLATION"),
			],
		} satisfies BundleNested);
		const generated = await compileProject({
			project,
			compilerOptions: {
				outputStructure: "locale-modules",
				experimentalStaticLocale: perLocaleBuildStaticLocaleExpression,
				emitGitIgnore: false,
				emitPrettierIgnore: false,
				emitReadme: false,
			},
		});
		const generatedRoot = nodePath.join(root, "src/paraglide");
		for (const [fileName, source] of Object.entries(generated)) {
			const path = nodePath.join(generatedRoot, fileName);
			await nodeFs.mkdir(nodePath.dirname(path), { recursive: true });
			await nodeFs.writeFile(path, source);
		}
		await Promise.all([
			nodeFs.writeFile(
				nodePath.join(root, "index.html"),
				'<script type="module" src="./src/main.js"></script>\n'
			),
			nodeFs.writeFile(
				nodePath.join(root, "src/main.js"),
				'import { greeting } from "./paraglide/messages.js";\ndocument.body.textContent = greeting();\n'
			),
		]);

		const builder = await createBuilder({
			configFile: false,
			root,
			base: "./",
			logLevel: "silent",
			build: { minify: false, sourcemap: true },
			plugins: [
				createViteLocaleEnvironmentPlugin({
					settings: async () => ({
						baseLocale: "en",
						locales: ["en", "de"],
					}),
				}),
			],
		});
		await builder.buildApp();

		const outputRoot = nodePath.join(root, "dist");
		const manifest = JSON.parse(
			await nodeFs.readFile(
				nodePath.join(outputRoot, VITE_LOCALE_BUILD_MANIFEST),
				"utf8"
			)
		) as ViteLocaleBuildManifest;
		const enGraph = await readGraphText(outputRoot, manifest.locales.en!);
		const deGraph = await readGraphText(outputRoot, manifest.locales.de!);
		expect(enGraph).toContain("EN_COMPILED_TRANSLATION");
		expect(enGraph).not.toContain("DE_COMPILED_TRANSLATION");
		expect(deGraph).toContain("DE_COMPILED_TRANSLATION");
		expect(deGraph).not.toContain("EN_COMPILED_TRANSLATION");
	} finally {
		await project.close();
		await nodeFs.rm(temporaryRoot, { recursive: true, force: true });
	}
});

test.each(["plugin override", "project config"] as const)(
	"message modules from %s specialize direct imports and keep lazy page messages out of initial chunks",
	async (source) => {
		vi.resetModules();
		const { paraglideVitePlugin } = await import("../vite.js");
		const temporaryRoot = await nodeFs.mkdtemp(
			nodePath.join(nodeOs.tmpdir(), "paraglide-vite-message-modules-")
		);
		const root = await nodeFs.realpath(temporaryRoot);
		try {
			const projectRoot = nodePath.join(root, "project.inlang");
			await nodeFs.mkdir(projectRoot, { recursive: true });
			await nodeFs.mkdir(nodePath.join(root, "messages"));
			await nodeFs.writeFile(
				nodePath.join(projectRoot, "paraglide.config.js"),
				`export default { outputStructure: "${source === "project config" ? "message-modules" : "locale-modules"}" };`
			);
			await nodeFs.copyFile(
				createRequire(import.meta.url).resolve("@inlang/plugin-message-format"),
				nodePath.join(root, "plugin.js")
			);
			await nodeFs.writeFile(
				nodePath.join(projectRoot, "settings.json"),
				JSON.stringify({
					baseLocale: "en",
					locales: ["en", "de"],
					modules: ["./plugin.js"],
					"plugin.inlang.messageFormat": {
						pathPattern: "./messages/{locale}.json",
					},
				})
			);
			for (const locale of ["en", "de"]) {
				await nodeFs.writeFile(
					nodePath.join(root, "messages", `${locale}.json`),
					JSON.stringify(
						Object.fromEntries(
							["greeting", "lazy_message", "unused_message"].map((id) => [
								id,
								`${locale.toUpperCase()}_${id.toUpperCase()}`,
							])
						)
					)
				);
			}

			await nodeFs.mkdir(nodePath.join(root, "src"), { recursive: true });
			await Promise.all([
				nodeFs.writeFile(
					nodePath.join(root, "index.html"),
					'<script type="module" src="./src/main.js"></script>'
				),
				nodeFs.writeFile(
					nodePath.join(root, "src/main.js"),
					'import { greeting } from "./paraglide/messages/greeting.js"; globalThis.translation = greeting(); globalThis.loadPage = () => import("./lazy-page.js");'
				),
				nodeFs.writeFile(
					nodePath.join(root, "src/lazy-page.js"),
					'import { lazy_message } from "./paraglide/messages/lazy_message.js"; globalThis.lazyTranslation = lazy_message();'
				),
			]);
			const server = await createServer({
				configFile: false,
				root,
				logLevel: "silent",
				server: { port: 0, host: "127.0.0.1" },
				plugins: [
					paraglideVitePlugin({
						project: "./project.inlang",
						outdir: "./src/paraglide-dev",
						fs: { ...nodeSyncFs },
						experimentalPerLocaleBuild: true,
						...(source === "plugin override"
							? { outputStructure: "message-modules" as const }
							: {}),
					}),
				],
			});
			try {
				await server.listen();
				await server.environments.client!.pluginContainer.buildStart();
				const transformed = await server.transformRequest(
					"/src/paraglide-dev/messages/greeting.js"
				);
				expect(transformed?.code).toContain("EN_GREETING");
			} finally {
				await server.close();
			}

			const builder = await createBuilder({
				configFile: false,
				root,
				base: "./",
				logLevel: "silent",
				build: { minify: false, modulePreload: false, sourcemap: true },
				plugins: [
					paraglideVitePlugin({
						project: "./project.inlang",
						outdir: "./src/paraglide",
						fs: { ...nodeSyncFs },
						experimentalPerLocaleBuild: true,
						...(source === "plugin override"
							? { outputStructure: "message-modules" as const }
							: {}),
					}),
				],
			});
			await builder.buildApp();
			const outputRoot = nodePath.join(root, "dist");
			const manifest = JSON.parse(
				await nodeFs.readFile(
					nodePath.join(outputRoot, VITE_LOCALE_BUILD_MANIFEST),
					"utf8"
				)
			) as ViteLocaleBuildManifest;
			for (const locale of ["en", "de"] as const) {
				const variant = manifest.locales[locale]!;
				const graph = await readJavaScriptGraph(outputRoot, variant);
				const prefix = locale.toUpperCase();
				expect(graph).toContain(`${prefix}_GREETING`);
				expect(graph).toContain(`${prefix}_LAZY_MESSAGE`);
				expect(graph).not.toContain(
					`${locale === "en" ? "DE" : "EN"}_GREETING`
				);
				expect(graph).not.toContain(
					`${locale === "en" ? "DE" : "EN"}_LAZY_MESSAGE`
				);
				const initialNames = new Set<string>();
				const visit = (name: string) => {
					if (initialNames.has(name)) return;
					initialNames.add(name);
					for (const imported of variant.files.find(
						(file) => file.fileName === name
					)?.imports ?? [])
						visit(imported);
				};
				for (const entry of variant.files.filter((file) => file.entry))
					visit(entry.fileName);
				const initial = (
					await Promise.all(
						[...initialNames].map((name) =>
							nodeFs.readFile(
								nodePath.join(outputRoot, variant.directory, name),
								"utf8"
							)
						)
					)
				).join("\n");
				expect(initial).not.toContain(`${prefix}_LAZY_MESSAGE`);
				expect(initial).not.toContain("UNUSED_MESSAGE");
				expect(
					variant.files.some((file) => (file.dynamicImports?.length ?? 0) > 0)
				).toBe(true);
				// Execute the actual emitted initial graph. The lazy loader remains uncalled.
				await nodeFs.writeFile(
					nodePath.join(root, "package.json"),
					'{"type":"module"}'
				);
				const entry = variant.files.find((file) => file.entry)!;
				const entryUrl = pathToFileURL(
					nodePath.join(outputRoot, variant.directory, entry.fileName)
				).href;
				const translation = execFileSync(
					process.execPath,
					[
						"--input-type=module",
						"-e",
						`await import(${JSON.stringify(entryUrl)}); process.stdout.write(globalThis.translation);`,
					],
					{ encoding: "utf8" }
				);
				expect(translation).toBe(`${prefix}_GREETING`);
			}
		} finally {
			await nodeFs.rm(temporaryRoot, { recursive: true, force: true });
		}
	}
);

test.each([undefined, "message-modules", "locale-modules"] as const)(
	"per-locale dev watches layout changes with plugin override %s",
	async (override) => {
		vi.resetModules();
		const { paraglideVitePlugin } = await import("../vite.js");
		const root = await nodeFs.mkdtemp(
			nodePath.join(nodeOs.tmpdir(), "paraglide-vite-layout-watch-")
		);
		try {
			const projectRoot = nodePath.join(root, "project.inlang");
			const configPath = nodePath.join(projectRoot, "paraglide.config.js");
			await nodeFs.mkdir(projectRoot);
			await nodeFs.mkdir(nodePath.join(root, "messages"));
			await nodeFs.copyFile(
				createRequire(import.meta.url).resolve("@inlang/plugin-message-format"),
				nodePath.join(root, "plugin.js")
			);
			await nodeFs.writeFile(
				nodePath.join(projectRoot, "settings.json"),
				JSON.stringify({
					baseLocale: "en",
					locales: ["en", "de"],
					modules: ["./plugin.js"],
					"plugin.inlang.messageFormat": {
						pathPattern: "./messages/{locale}.json",
					},
				})
			);
			for (const locale of ["en", "de"]) {
				await nodeFs.writeFile(
					nodePath.join(root, "messages", `${locale}.json`),
					JSON.stringify({ greeting: `${locale.toUpperCase()}_GREETING` })
				);
			}
			await nodeFs.writeFile(
				configPath,
				'export default { outputStructure: "message-modules" };'
			);
			const server = await createServer({
				configFile: false,
				root,
				logLevel: "silent",
				server: { port: 0, host: "127.0.0.1", watch: null },
				plugins: [
					paraglideVitePlugin({
						project: "./project.inlang",
						outdir: "./src/paraglide",
						fs: { ...nodeSyncFs },
						experimentalPerLocaleBuild: true,
						...(override === undefined ? {} : { outputStructure: override }),
					}),
				],
			});
			try {
				await server.listen();
				await server.environments.client!.pluginContainer.buildStart();
				const assertLayout = async (
					configured: "message-modules" | "locale-modules" | undefined
				) => {
					const expected = override ?? configured ?? "locale-modules";
					const code = await nodeFs.readFile(
						nodePath.join(
							root,
							expected === "message-modules"
								? "src/paraglide/messages/greeting.js"
								: "src/paraglide/messages/_index.js"
						),
						"utf8"
					);
					if (expected === "message-modules") {
						expect(code).toContain("EN_GREETING");
						expect(code).toContain("DE_GREETING");
					} else {
						expect(code).not.toContain("EN_GREETING");
						expect(code).toContain("./en.js");
					}
				};
				await assertLayout("message-modules");
				for (const layout of [
					"locale-modules",
					undefined,
					"message-modules",
				] as const) {
					await nodeFs.writeFile(
						configPath,
						`export default ${JSON.stringify(layout ? { outputStructure: layout } : {})};`
					);
					await server.environments.client!.pluginContainer.watchChange(
						configPath,
						{ event: "update" }
					);
					await assertLayout(layout);
				}
				await nodeFs.rm(configPath);
				await server.environments.client!.pluginContainer.watchChange(
					configPath,
					{ event: "delete" }
				);
				await assertLayout(undefined);
				await nodeFs.writeFile(
					configPath,
					'export default { outputStructure: "message-modules" };'
				);
				await server.environments.client!.pluginContainer.watchChange(
					configPath,
					{ event: "create" }
				);
				await assertLayout("message-modules");
			} finally {
				await server.close();
			}
		} finally {
			await nodeFs.rm(root, { recursive: true, force: true });
		}
	}
);

test("invalid project config keeps the per-locale dev server available", async () => {
	vi.resetModules();
	const { paraglideVitePlugin } = await import("../vite.js");
	const root = await nodeFs.mkdtemp(
		nodePath.join(nodeOs.tmpdir(), "paraglide-vite-invalid-config-")
	);
	try {
		const projectRoot = nodePath.join(root, "project.inlang");
		await nodeFs.mkdir(projectRoot);
		await nodeFs.writeFile(
			nodePath.join(projectRoot, "paraglide.config.js"),
			"export default {"
		);
		const server = await createServer({
			configFile: false,
			root,
			logLevel: "silent",
			server: { port: 0, host: "127.0.0.1" },
			plugins: [
				paraglideVitePlugin({
					project: "./project.inlang",
					outdir: "./src/paraglide",
					experimentalPerLocaleBuild: true,
					fs: { ...nodeSyncFs },
				}),
			],
		});
		try {
			await server.listen();
			expect(server.httpServer?.listening).toBe(true);
		} finally {
			await server.close();
		}
	} finally {
		await nodeFs.rm(root, { recursive: true, force: true });
	}
});

function createMessage(locale: "en" | "de", value: string) {
	return {
		id: `greeting-${locale}`,
		bundle_id: "greeting",
		locale,
		selectors: [],
		variants: [
			{
				id: `greeting-${locale}-variant`,
				message_id: `greeting-${locale}`,
				matches: [],
				pattern: [{ type: "text" as const, value }],
			},
		],
	};
}

async function readJavaScriptGraph(
	outputRoot: string,
	locale: ViteLocaleBuildManifest["locales"][string]
): Promise<string> {
	const chunks = locale.files.filter(
		(file) => file.type === "chunk" && file.fileName.endsWith(".js")
	);
	return (
		await Promise.all(
			chunks.map((chunk) =>
				nodeFs.readFile(
					nodePath.join(outputRoot, locale.directory, chunk.fileName),
					"utf8"
				)
			)
		)
	).join("\n");
}

async function readSourceMaps(
	outputRoot: string,
	locale: ViteLocaleBuildManifest["locales"][string]
): Promise<string> {
	return (
		await Promise.all(
			locale.files
				.filter((file) => file.fileName.endsWith(".map"))
				.map((file) =>
					nodeFs.readFile(
						nodePath.join(outputRoot, locale.directory, file.fileName),
						"utf8"
					)
				)
		)
	).join("\n");
}

async function readGraphText(
	outputRoot: string,
	locale: ViteLocaleBuildManifest["locales"][string]
): Promise<string> {
	return (
		await Promise.all(
			locale.files
				.filter(
					(file) =>
						(file.type === "chunk" && file.fileName.endsWith(".js")) ||
						file.fileName.endsWith(".map")
				)
				.map((file) =>
					nodeFs.readFile(
						nodePath.join(outputRoot, locale.directory, file.fileName),
						"utf8"
					)
				)
		)
	).join("\n");
}
