import { expect, test, vi } from "vitest";
import { generateCatalog } from "./incremental-output.js";
import { compileCatalog, type CatalogInput } from "./compile-project.js";
import * as compiler from "./compile-bundle.js";
import type { CompilerOptions } from "./compiler-options.js";
const options: CompilerOptions = {
	project: "/project.inlang",
	outdir: "/out",
	emitTsDeclarations: true,
	cleanOutdir: false,
};
function catalog(ids = ["alpha", "beta", "gamma"]): CatalogInput {
	return {
		settings: { baseLocale: "en", locales: ["en", "de"], modules: [] },
		bundles: ids.map((id) => ({
			id,
			declarations: [],
			messages: [
				{
					id: `${id}_en`,
					bundle_id: id,
					locale: "en",
					selectors: [],
					variants: [
						{
							id: `${id}_v`,
							message_id: `${id}_en`,
							matches: [],
							pattern: [{ type: "text", value: id }],
						},
					],
				},
			],
		})),
	};
}
const reset = (value: CatalogInput) => ({
	...value,
	type: "reset" as const,
	diagnostics: [],
});
async function fresh(value: CatalogInput, o = options) {
	return compileCatalog({
		catalog: value,
		projectPath: o.project,
		compilerOptions: o,
	});
}

test("translation and input edits compile only affected bundles and match a clean build", async () => {
	const spy = vi.spyOn(compiler, "compileBundle");
	try {
		const initial = catalog();
		const first = await generateCatalog({
			catalog: initial,
			update: reset(initial),
			options,
		});
		expect(spy).toHaveBeenCalledTimes(3);
		spy.mockClear();
		const next = structuredClone(initial),
			bundle = next.bundles[1]!;
		bundle.declarations = [{ type: "input-variable", name: "username" }];
		bundle.messages[0]!.variants[0]!.pattern = [
			{ type: "text", value: "Hello " },
			{
				type: "expression",
				arg: { type: "variable-reference", name: "username" },
			},
		];
		const result = await generateCatalog({
			catalog: next,
			update: {
				type: "update",
				bundles: [bundle],
				removedBundleIds: [],
				diagnostics: [],
			},
			options,
			previous: first,
			previousCatalog: initial,
		});
		expect(spy).toHaveBeenCalledTimes(1);
		expect(result.output).toEqual(await fresh(next));
		spy.mockClear();
		const noop = await generateCatalog({
			catalog: next,
			update: {
				type: "update",
				bundles: [],
				removedBundleIds: [],
				diagnostics: [],
			},
			options,
			previous: result,
			previousCatalog: next,
		});
		expect(spy).not.toHaveBeenCalled();
		expect(noop.output).toBe(result.output);
	} finally {
		spy.mockRestore();
	}
});

test.each([
	{ outputStructure: "locale-modules" as const },
	{ messageModuleSize: 2 },
	{ experimentalStaticLocale: '"de"' },
])("shared output falls back safely: %j", async (extra) => {
	const o = { ...options, ...extra },
		initial = catalog(),
		first = await generateCatalog({
			catalog: initial,
			update: reset(initial),
			options: o,
		});
	const next = structuredClone(initial);
	next.bundles[1]!.messages[0]!.variants[0]!.pattern = [
		{ type: "text", value: "changed" },
	];
	const result = await generateCatalog({
		catalog: next,
		update: {
			type: "update",
			bundles: [next.bundles[1]!],
			removedBundleIds: [],
			diagnostics: [],
		},
		options: o,
		previous: first,
		previousCatalog: initial,
	});
	expect(result.output).toEqual(await fresh(next, o));
});

test("mutating options and changing message keys invalidates generated output", async () => {
	const o = { ...options, strategy: ["baseLocale" as const] },
		initial = catalog(),
		first = await generateCatalog({
			catalog: initial,
			update: reset(initial),
			options: o,
		});
	o.strategy = ["cookie" as never];
	const second = await generateCatalog({
		catalog: initial,
		update: {
			type: "update",
			bundles: [],
			removedBundleIds: [],
			diagnostics: [],
		},
		options: o,
		previous: first,
		previousCatalog: initial,
	});
	expect(second.output).toEqual(await fresh(initial, o));
	expect(second.output["runtime.js"]).not.toBe(first.output["runtime.js"]);
	const next = catalog(["alpha", "beta", "new_key"]);
	const third = await generateCatalog({
		catalog: next,
		update: {
			type: "update",
			bundles: [next.bundles[2]!],
			removedBundleIds: ["gamma"],
			diagnostics: [],
		},
		options: o,
		previous: second,
		previousCatalog: initial,
	});
	expect(third.output).toEqual(await fresh(next, o));
	expect(third.output).not.toHaveProperty("messages/gamma.js");
});

test("bundles whose module ids depend on other bundles are compiled with the whole catalog", async () => {
	const initial = catalog(["a-b", "a_b", "registry"]),
		first = await generateCatalog({
			catalog: initial,
			update: reset(initial),
			options,
		});
	const next = structuredClone(initial);
	next.bundles[0]!.messages[0]!.variants[0]!.pattern = [
		{ type: "text", value: "edited" },
	];
	const result = await generateCatalog({
		catalog: next,
		update: {
			type: "update",
			bundles: [next.bundles[0]!],
			removedBundleIds: [],
			diagnostics: [],
		},
		options,
		previous: first,
		previousCatalog: initial,
	});
	expect(result.output).toEqual(await fresh(next));
	expect(result.output["messages/$a$2d$b.js"]).toContain("edited");
});
