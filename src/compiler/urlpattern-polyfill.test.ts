import { afterEach, expect, test, vi } from "vitest";
import { URLPattern } from "urlpattern-polyfill";
import { createRequire } from "node:module";
import virtual from "@rollup/plugin-virtual";
import { rolldown } from "rolldown";
import { compileCatalog } from "./compile-project.js";
import type { CompilerOptions } from "./compiler-options.js";
import type { Runtime } from "./runtime/type.js";
import { createProject, ts } from "@ts-morph/bootstrap";
import { fileURLToPath } from "node:url";

const polyfillSpecifier = "@inlang/paraglide-js/urlpattern-polyfill";
const polyfillImport = `import "${polyfillSpecifier}";`;
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

test("opt-out runtime passes checkJs without ambient URLPattern declarations", async () => {
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
		fileURLToPath(new URL("./runtime.opt-out.js", import.meta.url)),
		await compileRuntime({
			urlPatterns,
			routeStrategies,
			urlPatternPolyfill: false,
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
	"polyfill opt-out preserves the default for %s",
	async (_, options, needsPolyfill) => {
		for (const urlPatternPolyfill of [undefined, true, false]) {
			const code = await compileRuntime({ ...options, urlPatternPolyfill });
			expect(code.includes(polyfillImport)).toBe(
				needsPolyfill && urlPatternPolyfill !== false
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
		urlPatternPolyfill: false,
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

test.each([true, false])(
	"browser bundle includes polyfill modules only when enabled (%s)",
	async (urlPatternPolyfill) => {
		const runtime = await compileRuntime({ urlPatterns, urlPatternPolyfill });
		const polyfillPath = createRequire(import.meta.url).resolve(
			polyfillSpecifier
		);
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
					"entry.js": 'export { localizeUrl } from "./runtime.js";',
					"runtime.js": runtime,
				}),
			],
		});
		try {
			const { output } = await build.generate({ format: "esm" });
			const chunks = output.filter((item) => item.type === "chunk");
			expect(chunks).toHaveLength(1);
			const entry = chunks[0]!;
			expect(entry.imports).toEqual([]);
			expect(entry.dynamicImports).toEqual([]);
			expect(
				Object.keys(entry.modules).some((id) =>
					id.includes("urlpattern-polyfill")
				)
			).toBe(urlPatternPolyfill);
		} finally {
			await build.close();
		}
	}
);
