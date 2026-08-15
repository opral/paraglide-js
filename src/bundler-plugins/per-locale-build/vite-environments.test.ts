import nodeFs from "node:fs/promises";
import nodeOs from "node:os";
import nodePath from "node:path";
import {
	insertBundleNested,
	loadProjectInMemory,
	newProject,
	type BundleNested,
} from "@inlang/sdk";
import { createBuilder } from "vite";
import { expect, test } from "vitest";
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

function createMessage(locale: "en" | "de", value: string) {
	return {
		id: `greeting-${locale}`,
		bundleId: "greeting",
		locale,
		selectors: [],
		variants: [
			{
				id: `greeting-${locale}-variant`,
				messageId: `greeting-${locale}`,
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
