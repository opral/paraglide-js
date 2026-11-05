import { afterEach, expect, test, vi } from "vitest";
import { URLPattern } from "urlpattern-polyfill";
import { createRequire } from "node:module";
import virtual from "@rollup/plugin-virtual";
import { rolldown } from "rolldown";
import { compileCatalog } from "./compile-project.js";
import type { CompilerOptions } from "./compiler-options.js";
import type { Runtime } from "./runtime/type.js";
import { createProject, ts } from "@ts-morph/bootstrap";
import { fileURLToPath, pathToFileURL } from "node:url";
import fs from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";

const polyfillSpecifier = "@inlang/paraglide-js/urlpattern-polyfill";
const polyfillImport = `import "${polyfillSpecifier}";`;
const lazyPolyfillImport = `await import("${polyfillSpecifier}");`;
const urlPatterns: NonNullable<CompilerOptions["urlPatterns"]> = [
	{
		pattern: "https://example.com/products/:id",
		localized: [
			["en", "https://example.com/products/:id"],
			["de", "https://example.com/produkte/:id"],
		],
	},
];
const routeStrategies: NonNullable<CompilerOptions["routeStrategies"]> = [
	{ match: "/products/:id", strategy: ["baseLocale"] },
];

async function compileRuntime(options: Partial<CompilerOptions>) {
	const output = await compileCatalog({
		catalog: {
			settings: { baseLocale: "en", locales: ["en", "de"] },
			bundles: [],
		},
		compilerOptions: {
			strategy: ["url", "baseLocale"],
			...options,
		},
	});
	return output["runtime.js"]!;
}

afterEach(() => vi.unstubAllGlobals());

test("lazy runtime passes checkJs without ambient URLPattern declarations", async () => {
	const project = await createProject({
		compilerOptions: {
			allowJs: true,
			checkJs: true,
			strict: true,
			noEmit: true,
			noUnusedLocals: true,
			module: ts.ModuleKind.Node16,
			target: ts.ScriptTarget.ES2022,
			types: [],
		},
	});
	project.createSourceFile(
		fileURLToPath(new URL("./runtime.lazy-polyfill.js", import.meta.url)),
		await compileRuntime({
			urlPatterns,
			routeStrategies,
			lazyUrlPatternPolyfill: true,
		})
	);
	expect(
		ts
			.getPreEmitDiagnostics(project.createProgram())
			.map((diagnostic) =>
				ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")
			)
	).toEqual([]);
});

test.each([
	["default routing", {}, false],
	["custom URL patterns", { urlPatterns }, true],
	["route strategies", { routeStrategies }, true],
	["both", { urlPatterns, routeStrategies }, true],
] as const)(
	"lazy polyfill loading preserves the default for %s",
	async (_, options, needsPolyfill) => {
		for (const lazyUrlPatternPolyfill of [undefined, true, false]) {
			const code = await compileRuntime({ ...options, lazyUrlPatternPolyfill });
			expect(code.includes(polyfillImport)).toBe(
				needsPolyfill && lazyUrlPatternPolyfill !== true
			);
			expect(code.includes(lazyPolyfillImport)).toBe(
				needsPolyfill && lazyUrlPatternPolyfill === true
			);
		}
	}
);

test("custom matching and route strategies use an application-provided URLPattern", async () => {
	let constructions = 0;
	class ProvidedURLPattern extends URLPattern {
		constructor(...args: ConstructorParameters<typeof URLPattern>) {
			super(...args);
			constructions++;
		}
	}
	vi.stubGlobal("URLPattern", ProvidedURLPattern);
	const code = await compileRuntime({
		urlPatterns,
		routeStrategies,
		lazyUrlPatternPolyfill: true,
	});
	// Reset after compilation so this only counts generated runtime matching.
	constructions = 0;
	const runtime = (await import(
		`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`
	)) as Runtime;
	expect(
		runtime.localizeUrl("https://example.com/products/123", { locale: "de" })
			.href
	).toBe("https://example.com/produkte/123");
	expect(runtime.deLocalizeUrl("https://example.com/produkte/123").href).toBe(
		"https://example.com/products/123"
	);
	expect(runtime.extractLocaleFromUrl("https://example.com/produkte/123")).toBe(
		"de"
	);
	// The route strategy must match the canonical URL and override the url strategy.
	expect(runtime.getStrategyForUrl("https://example.com/produkte/123")).toEqual(
		["baseLocale"]
	);
	expect(constructions).toBeGreaterThan(0);
	expect(Reflect.get(globalThis, "URLPattern")).toBe(ProvidedURLPattern);
});

test.each([false, true])(
	"browser bundle loads the polyfill correctly with lazy loading %s",
	async (lazyUrlPatternPolyfill) => {
		const runtime = await compileRuntime({
			urlPatterns,
			routeStrategies,
			lazyUrlPatternPolyfill,
		});
		const require = createRequire(import.meta.url);
		const polyfillPath = require.resolve(polyfillSpecifier);
		const build = await rolldown({
			input: "entry.js",
			platform: "browser",
			plugins: [
				{
					name: "resolve-paraglide-polyfill",
					resolveId: (id) => (id === polyfillSpecifier ? polyfillPath : null),
				},
				// @ts-expect-error Rollup plugin types differ from Rolldown's public types.
				virtual({
					"entry.js": `
import { localizeUrl, deLocalizeUrl, extractLocaleFromUrl, getStrategyForUrl } from "./runtime.js";
// Calls during module evaluation must wait for the runtime's initialization.
export const localized = localizeUrl("https://example.com/products/123", { locale: "de" }).href;
export const canonical = deLocalizeUrl(localized).href;
export const locale = extractLocaleFromUrl(localized);
export const strategy = getStrategyForUrl(localized);
`,
					"runtime.js": runtime,
				}),
			],
		});
		const directory = await fs.realpath(
			await fs.mkdtemp(path.join(tmpdir(), "paraglide-lazy-polyfill-"))
		);
		try {
			const { output } = await build.generate({
				format: "esm",
				entryFileNames: "[name].mjs",
				chunkFileNames: "[name]-[hash].mjs",
			});
			const chunks = output.filter((item) => item.type === "chunk");
			expect(chunks).toHaveLength(lazyUrlPatternPolyfill ? 2 : 1);
			const entry = chunks.find((chunk) => chunk.isEntry)!;
			const polyfillChunks = chunks.filter((chunk) =>
				Object.keys(chunk.modules).some((id) =>
					id.includes("urlpattern-polyfill")
				)
			);
			expect(polyfillChunks).toHaveLength(1);
			expect(entry.imports).toEqual([]);
			expect(entry.dynamicImports).toHaveLength(lazyUrlPatternPolyfill ? 1 : 0);
			expect(polyfillChunks[0]!.isEntry).toBe(!lazyUrlPatternPolyfill);
			for (const chunk of chunks) {
				await fs.writeFile(path.join(directory, chunk.fileName), chunk.code);
			}
			const entryUrl = pathToFileURL(path.join(directory, entry.fileName)).href;
			const polyfillUrl = pathToFileURL(
				path.join(directory, polyfillChunks[0]!.fileName)
			).href;
			for (const provided of [true, false]) {
				// Fresh processes prevent an already-cached polyfill hiding a missing-global bug.
				const result = execFileSync(
					process.execPath,
					[
						"--input-type=module",
						"-e",
						`
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
${
	provided
		? `const { URLPattern } = await import(${JSON.stringify(pathToFileURL(require.resolve("urlpattern-polyfill")).href)});
globalThis.URLPattern = URLPattern;`
		: "delete globalThis.URLPattern;"
}
const original = globalThis.URLPattern;
let polyfillResolutions = 0;
registerHooks({ resolve(specifier, context, nextResolve) {
	const resolved = nextResolve(specifier, context);
	if (resolved.url === ${JSON.stringify(polyfillUrl)}) polyfillResolutions++;
	return resolved;
}});
const result = await import(${JSON.stringify(entryUrl)});
assert.equal(result.localized, "https://example.com/produkte/123");
assert.equal(result.canonical, "https://example.com/products/123");
assert.equal(result.locale, "de");
assert.deepEqual(result.strategy, ["baseLocale"]);
assert.equal(typeof globalThis.URLPattern, "function");
if (original) assert.equal(globalThis.URLPattern, original);
assert.equal(polyfillResolutions, ${lazyUrlPatternPolyfill && provided ? 0 : 1});
console.log("ok");
`,
					],
					{ encoding: "utf8" }
				);
				expect(result.trim()).toBe("ok");
			}
		} finally {
			await build.close();
			await fs.rm(directory, { recursive: true, force: true });
		}
	}
);
