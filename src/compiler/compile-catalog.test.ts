import { createCatalogLoader } from "@inlang/sdk/catalog";
import { afterAll, beforeAll, expect, test } from "vitest";
import * as sdk from "@inlang/sdk";
import messageFormat from "@inlang/plugin-message-format";
import { memfs } from "memfs";
import virtual from "@rollup/plugin-virtual";
import { rolldown } from "rolldown";
import { createProject as typescriptProject, ts } from "@ts-morph/bootstrap";
import {
	compileCatalog,
	compileProject,
	type CatalogInput,
} from "./compile-project.js";
import type { CompilerOptions } from "./compiler-options.js";

const settings = {
	baseLocale: "en",
	locales: ["en", "de", "en-GB"],
	modules: [],
	"plugin.inlang.messageFormat": { pathPattern: "/messages/{locale}.json" },
};
const select = (
	declarations: string[],
	selectors: string[],
	match: Record<string, string>
) => [{ declarations, selectors, match }];
const english = {
	greeting: "Hello {name}!",
	"greeting.unsafe": "Quoted {name}",
	class: "Reserved",
	nested: { label: "Nested" },
	items: select(
		["input count", "local category = count: plural"],
		["category"],
		{ "category=one": "One item", "category=*": "{count} items" }
	),
	context: select(["input state"], ["state"], {
		"state=ready": "Ready",
		"state=busy": "Busy",
	}),
	markup: "Hi {#strong}{name}{/strong}!{#icon/}",
	price: "{amount: number style=currency currency=$currency}",
	base_only: "Fallback {name}",
};
const german = {
	...english,
	greeting: "Hallo {name}!",
	markup: "Hallo {name}!",
};
delete (german as Partial<typeof german>).base_only;

let project: Awaited<ReturnType<typeof sdk.loadProjectFromDirectory>>;
let catalog: CatalogInput;
const fs = memfs({
	"/project.inlang/settings.json": JSON.stringify(settings),
	"/messages/en.json": JSON.stringify(english),
	"/messages/de.json": JSON.stringify(german),
	"/messages/en-GB.json": JSON.stringify({ greeting: "Hi {name}!" }),
}).fs as unknown as typeof import("node:fs");

beforeAll(async () => {
	project = await sdk.loadProjectFromDirectory({
		path: "/project.inlang",
		fs,
		providePlugins: [messageFormat as sdk.InlangPlugin],
	});
	catalog = {
		settings: await project.settings.get(),
		bundles: await sdk.selectBundleNested(project.db).execute(),
	};
});
afterAll(async () => {
	await project?.close();
});

for (const outputStructure of ["message-modules", "locale-modules"] as const) {
	for (const emitTsDeclarations of [false, true]) {
		test(`compileCatalog preserves complete ${outputStructure} output (dts: ${emitTsDeclarations})`, async () => {
			const compilerOptions = { outputStructure, emitTsDeclarations };
			const expected = await compileProject({
				project,
				projectPath: "./project.inlang",
				compilerOptions,
			});
			const actual = await compileCatalog({
				catalog,
				projectPath: "./project.inlang",
				compilerOptions,
			});
			expect(actual).toEqual(expected);
			expect(catalog.bundles.length).toBe(9);
		});
	}
	for (const extraOptions of [
		{ experimentalStaticLocale: '"de"' },
		{
			disableAsyncLocalStorage: true,
			routeStrategies: [
				{ match: "/private/:path(.*)?", strategy: ["baseLocale"] },
			],
		},
	] satisfies Partial<CompilerOptions>[]) {
		test(`compileCatalog keeps ${outputStructure} option ${Object.keys(extraOptions)[0]} behavior`, async () => {
			const compilerOptions = {
				...extraOptions,
				outputStructure,
				emitTsDeclarations: true,
			};
			expect(await compileCatalog({ catalog, compilerOptions })).toEqual(
				await compileProject({ project, compilerOptions })
			);
		});
	}

	test(`catalog output executes plurals, markup, aliases and fallback in ${outputStructure}`, async () => {
		const output = await compileCatalog({
			catalog,
			compilerOptions: {
				outputStructure,
				emitTsDeclarations: true,
				strategy: ["baseLocale"],
			},
		});
		const m = await loadMessages(output);
		expect(m.greeting({ name: "Ada" }, { locale: "de" })).toBe("Hallo Ada!");
		expect(m.greeting({ name: "Ada" }, { locale: "en-GB" })).toBe("Hi Ada!");
		expect(m.base_only({ name: "Ada" }, { locale: "de" })).toBe("Fallback Ada");
		expect(m["greeting.unsafe"]({ name: "Ada" })).toBe("Quoted Ada");
		expect(m["nested.label"]()).toBe("Nested");
		expect(m.class()).toBe("Reserved");
		expect(m.items({ count: 1 })).toBe("One item");
		expect(m.items({ count: 3 })).toBe("3 items");
		expect(m.context({ state: "ready" })).toBe("Ready");
		expect(m.markup.parts({ name: "Ada" }, { locale: "en" })).toEqual([
			{ type: "text", value: "Hi " },
			{ type: "markup-start", name: "strong", options: {}, attributes: {} },
			{ type: "text", value: "Ada" },
			{ type: "markup-end", name: "strong", options: {}, attributes: {} },
			{ type: "text", value: "!" },
			{ type: "markup-standalone", name: "icon", options: {}, attributes: {} },
		]);
		expect(m.markup.parts({ name: "Ada" }, { locale: "de" })).toEqual([
			{ type: "text", value: "Hallo Ada!" },
		]);
		expect(m.price({ amount: 12.5, currency: "EUR" }, { locale: "de" })).toBe(
			new Intl.NumberFormat("de", {
				style: "currency",
				currency: "EUR",
			}).format(12.5)
		);
	});
}

test("compileCatalog does not mutate a detached catalog snapshot", async () => {
	const detached = structuredClone(catalog);
	const before = structuredClone(detached);
	const freeze = (value: unknown): void => {
		if (!value || typeof value !== "object") return;
		for (const entry of Object.values(value)) freeze(entry);
		Object.freeze(value);
	};
	freeze(detached);
	for (const outputStructure of [
		"message-modules",
		"locale-modules",
	] as const) {
		await compileCatalog({
			catalog: detached,
			compilerOptions: { outputStructure, emitTsDeclarations: true },
		});
	}
	expect(detached).toEqual(before);
});

test("catalog declarations preserve strict consumer inputs and locale checking", async () => {
	const output = await compileCatalog({
		catalog,
		compilerOptions: { emitTsDeclarations: true },
	});
	const consumer = await typescriptProject({
		useInMemoryFileSystem: true,
		compilerOptions: {
			strict: true,
			module: ts.ModuleKind.Node16,
			moduleResolution: ts.ModuleResolutionKind.Node16,
		},
	});
	for (const [name, code] of Object.entries(output))
		if (name.endsWith(".d.ts")) consumer.createSourceFile(name, code);
	consumer.createSourceFile(
		"consumer.ts",
		`
		import { m, "greeting.unsafe" as quoted } from "./messages.js";
		m.greeting({ name: "Ada" }, { locale: "de" }) satisfies string;
		quoted({ name: "Ada" }) satisfies string;
		m.markup.parts({ name: "Ada" });
		m.context({ state: "ready" });
		// @ts-expect-error required input
		m.greeting();
		// @ts-expect-error locale outside configured union
		m.greeting({ name: "Ada" }, { locale: "fr" });
		// @ts-expect-error closed selector input
		m.context({ state: "missing" });
	`
	);
	expect(
		ts
			.getPreEmitDiagnostics(consumer.createProgram())
			.map((diagnostic) => diagnostic.messageText)
	).toEqual([]);
});

test("actual catalog loader produces the same compiled files as the project database", async () => {
	const loaded = await createCatalogLoader({
		path: "/project.inlang",
		fs,
		providePlugins: [messageFormat as sdk.InlangPlugin],
	}).load();
	expect(loaded.diagnostics).toEqual([]);
	if (loaded.type !== "reset") throw new Error("Expected first load to reset");
	for (const outputStructure of [
		"message-modules",
		"locale-modules",
	] as const) {
		expect(
			await compileCatalog({
				catalog: { settings: loaded.settings, bundles: [...loaded.bundles] },
				compilerOptions: { outputStructure, emitTsDeclarations: true },
			})
		).toEqual(
			await compileProject({
				project,
				compilerOptions: { outputStructure, emitTsDeclarations: true },
			})
		);
	}
});

async function loadMessages(
	output: Record<string, string>
): Promise<Record<string, any>> {
	const generated = { ...output };
	generated["runtime.js"] = generated["runtime.js"]!.replace(
		'import "@inlang/paraglide-js/urlpattern-polyfill";',
		"const URLPattern = globalThis.URLPattern;"
	);
	const bundle = await rolldown({
		input: ["main.js"],
		plugins: [
			// @ts-expect-error Rollup plugin types differ from Rolldown's public types.
			virtual({
				...Object.fromEntries(
					Object.entries(generated)
						.filter(([name]) => name.endsWith(".js"))
						.map(([name, code]) => [`paraglide/${name}`, code])
				),
				"main.js": 'export * from "./paraglide/messages.js";',
			}),
		],
	});
	try {
		const compiled = await bundle.generate({ format: "esm" });
		return (
			await import(
				`data:text/javascript;base64,${Buffer.from(compiled.output[0]!.code).toString("base64")}`
			)
		).m;
	} finally {
		await bundle.close();
	}
}

test.each([compileCatalog, compileProject])(
	"rejects the removed additionalFiles option before generating output (%#)",
	async (compiler) => {
		await expect(
			compiler({
				project,
				catalog,
				compilerOptions: {
					// @ts-expect-error additionalFiles is no longer a public option
					additionalFiles: { "runtime.js": "export const replaced = true;" },
				},
			})
		).rejects.toThrow("additionalFiles was removed in Paraglide JS 3");
	}
);
