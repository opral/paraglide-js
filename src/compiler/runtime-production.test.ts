import { afterEach, expect, test, vi } from "vitest";
import type { BundleNested, Pattern } from "@inlang/sdk";
import path from "node:path";
import virtual from "@rollup/plugin-virtual";
import { build } from "vite";
import { compileCatalog, type CatalogInput } from "./compile-project.js";
import type { CompilerOptions } from "./compiler-options.js";
import { perLocaleBuildStaticLocaleExpression } from "./per-locale-build.js";

function message(
	id: string,
	patterns: Record<string, Pattern>,
	input?: string
): BundleNested {
	return {
		id,
		declarations: input ? [{ type: "input-variable", name: input }] : [],
		messages: Object.entries(patterns).map(([locale, pattern]) => ({
			id: `${id}_${locale}`,
			bundle_id: id,
			locale,
			selectors: [],
			variants: [
				{
					id: `${id}_${locale}_variant`,
					message_id: `${id}_${locale}`,
					matches: [],
					pattern,
				},
			],
		})),
	};
}

const text = (value: string): Pattern => [{ type: "text", value }];
const catalog: CatalogInput = {
	settings: { baseLocale: "en", locales: ["en", "de"] },
	bundles: [
		message("greeting", { en: text("Hello"), de: text("Hallo") }),
		message(
			"welcome",
			Object.fromEntries(
				["en", "de"].map((locale) => [
					locale,
					[
						{
							type: "text",
							value: locale === "en" ? "Welcome " : "Willkommen ",
						},
						{
							type: "expression",
							arg: { type: "variable-reference", name: "name" },
						},
					] satisfies Pattern,
				])
			),
			"name"
		),
	],
};

function compile(options: Partial<CompilerOptions> = {}) {
	return compileCatalog({
		catalog,
		compilerOptions: {
			strategy: ["globalVariable", "baseLocale"],
			isServer: "false",
			experimentalStaticLocale: perLocaleBuildStaticLocaleExpression,
			cookieName: "UNUSED_COOKIE_SETUP_SENTINEL",
			emitTsDeclarations: true,
			...options,
		},
	});
}

async function minified(
	output: Record<string, string>,
	entry = 'export { greeting, welcome } from "./paraglide/messages.js";'
) {
	const files = Object.fromEntries(
		Object.entries(output)
			.filter(([name]) => name.endsWith(".js"))
			.map(([name, code]) => [
				path.resolve(`paraglide/${name}`),
				code.replaceAll(perLocaleBuildStaticLocaleExpression, '"de"'),
			])
	);
	// Exercise the optimizer used by current Vite without its Paraglide plugin:
	// the compiler flag must work independently of integration defaults.
	const result = await build({
		configFile: false,
		logLevel: "silent",
		plugins: [
			// @ts-expect-error Rollup plugin types differ from Vite's public types.
			virtual({ ...files, [path.resolve("main.js")]: entry }),
		],
		build: {
			write: false,
			minify: "oxc",
			lib: { entry: path.resolve("main.js"), formats: ["es"] },
			rolldownOptions: {
				output: {
					minify: {
						mangle: { keepNames: true },
						compress: { keepNames: { function: true, class: true } },
					},
				},
			},
		},
	});
	const built = Array.isArray(result) ? result[0] : result;
	if (!built || !("output" in built))
		throw new Error("Expected a bundle output");
	const chunk = built.output.find((file) => file.type === "chunk");
	if (!chunk) throw new Error("Expected a JavaScript bundle");
	return {
		code: chunk.code,
		async load() {
			// Each import must execute initialization rather than reuse the ESM cache.
			const code = `${chunk.code}\n// ${Math.random()}`;
			return import(
				`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`
			);
		},
	};
}

afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

for (const outputStructure of ["message-modules", "locale-modules"] as const) {
	test(`production ${outputStructure} keeps translated functions and the global marker without unused diagnostics or cookie setup`, async () => {
		const output = await compile({ isDevelopment: "false", outputStructure });
		const built = await minified(output);
		expect(built.code).not.toContain("options.locale cannot override");
		expect(built.code).not.toContain("UNUSED_COOKIE_SETUP_SENTINEL");
		expect(built.code).not.toContain("RegExp");
		expect(built.code).toContain("__paraglide");

		vi.stubGlobal("__paraglide", undefined);
		const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
		const messages = await built.load();
		expect(Reflect.get(globalThis, "__paraglide")).toEqual({});
		expect(messages.greeting({}, { locale: "en" })).toBe("Hallo");
		expect(messages.welcome({ name: "Ada" }, { locale: "en" })).toBe(
			"Willkommen Ada"
		);
		expect(messages.greeting.name).toBe("greeting");
		expect(messages.greeting.length).toBe(0);
		expect(messages.welcome.name).toBe("welcome");
		expect(messages.welcome.length).toBe(1);
		expect(warning).not.toHaveBeenCalled();
	});

	test(`development ${outputStructure} warns about a mismatched explicit locale while preserving the specialized output`, async () => {
		const built = await minified(
			await compile({ isDevelopment: "true", outputStructure })
		);
		const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
		const messages = await built.load();
		expect(messages.greeting({}, { locale: "de" })).toBe("Hallo");
		expect(warning).not.toHaveBeenCalled();
		expect(messages.greeting({}, { locale: "en" })).toBe("Hallo");
		expect(warning).toHaveBeenCalledExactlyOnceWith(
			expect.stringContaining("options.locale cannot override")
		);
	});
}

test("standalone compilation retains development diagnostics by default", async () => {
	const built = await minified(await compile());
	const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
	const messages = await built.load();
	messages.greeting({}, { locale: "en" });
	expect(warning).toHaveBeenCalledExactlyOnceWith(
		expect.stringContaining("options.locale cannot override")
	);
});

test("runtime initialization preserves an existing global marker and its contents", async () => {
	const marker = { existing: { retained: true } };
	vi.stubGlobal("__paraglide", marker);
	const built = await minified(await compile({ isDevelopment: "false" }));
	await built.load();
	expect(Reflect.get(globalThis, "__paraglide")).toBe(marker);
	expect(marker.existing.retained).toBe(true);
});

test("unused cookie setup can be removed while a used escaped cookie matcher still works", async () => {
	const output = await compile({
		isDevelopment: "false",
		experimentalStaticLocale: undefined,
		strategy: ["cookie", "baseLocale"],
		cookieName: "LOCALE.[key]",
	});
	const built = await minified(
		output,
		'export { extractLocaleFromCookie } from "./paraglide/runtime.js";'
	);
	vi.stubGlobal("document", {
		cookie: "OTHER_COOKIE=none; LOCALE.[key]=de; FOLLOWING=1",
	});
	const runtime = await built.load();
	expect(runtime.extractLocaleFromCookie()).toBe("de");
});

test("production diagnostics do not change public message declarations", async () => {
	const development = await compile({ isDevelopment: "true" });
	const production = await compile({ isDevelopment: "false" });
	const declarations = (output: Record<string, string>) =>
		Object.fromEntries(
			Object.entries(output).filter(
				([name]) => name.startsWith("messages") && name.endsWith(".d.ts")
			)
		);
	expect(declarations(production)).toEqual(declarations(development));
	expect(Object.keys(declarations(production))).not.toHaveLength(0);
});

test("a statically bound production shard keeps callable messages without an unused diagnostics import", async () => {
	// Per-locale multi-build grouping is intentionally unsupported; a literal
	// static locale exercises the supported shared-factory shard configuration.
	const output = await compile({
		isDevelopment: "false",
		experimentalStaticLocale: '"de"',
		messageModuleSize: 2,
	});
	const shards = Object.entries(output).filter(([name]) =>
		/messages\/_shard_\d+\.js$/.test(name)
	);
	expect(shards).toHaveLength(1);
	expect(shards[0]![1]).not.toMatch(/import \{[^}]*\bisDevelopment\b/);
	const built = await minified(output);
	expect(built.code).not.toContain("options.locale cannot override");
	expect(built.code).not.toContain("UNUSED_COOKIE_SETUP_SENTINEL");
	const messages = await built.load();
	expect(messages.greeting({}, { locale: "en" })).toBe("Hallo");
	expect(messages.welcome({ name: "Ada" }, { locale: "en" })).toBe(
		"Willkommen Ada"
	);
	expect(messages.greeting.name).toBe("greeting");
	expect(messages.greeting.length).toBe(0);
	expect(messages.welcome.name).toBe("welcome");
	expect(messages.welcome.length).toBe(1);
});
