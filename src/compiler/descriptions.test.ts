import { expect, test } from "vitest";
import ts from "typescript";
import type { CatalogInput } from "./compile-project.js";
import { compileCatalog } from "./compile-project.js";
import { generateCatalog } from "./incremental-output.js";
import { buildBundleDocumentation } from "./compile-bundle.js";

function catalog(description?: string | null): CatalogInput {
	return {
		settings: { baseLocale: "de", locales: ["de"], modules: [] },
		bundles: [
			{
				id: "save",
				declarations: [],
				...{ description },
				messages: [
					{
						id: "de",
						bundle_id: "save",
						locale: "de",
						selectors: [],
						variants: [
							{
								id: "v",
								message_id: "de",
								matches: [],
								pattern: [{ type: "text", value: "Sparen" }],
							},
						],
					},
				],
			},
		],
	};
}

const options = {
	project: "/project.inlang",
	outdir: "/out",
	emitTsDeclarations: true,
};

test.each([1, 2])(
	"description is escaped in JavaScript and declarations, grouped size %s",
	async (messageModuleSize) => {
		const value = catalog(
			"Shopping action.\r\nKeep it short. */ injected(); /*\n@param {wrong} input"
		);
		const output = await compileCatalog({
			catalog: value,
			projectPath: options.project,
			compilerOptions: { ...options, messageModuleSize },
		});
		const js = Object.entries(output)
			.filter(([name]) => name.startsWith("messages/") && name.endsWith(".js"))
			.map(([, code]) => code)
			.join("\n");
		const declarations = Object.entries(output)
			.filter(
				([name]) => name.startsWith("messages/") && name.endsWith(".d.ts")
			)
			.map(([, code]) => code)
			.join("\n");
		for (const code of [js, declarations]) {
			expect(code).toContain(
				"* Shopping action.\n* Keep it short. *\\/ injected(); /*\n* &#64;param {wrong} input"
			);
			expect(code).not.toContain("*/ injected();");
		}
		const transpiled = ts.transpileModule(js, {
			compilerOptions: { module: ts.ModuleKind.ESNext, removeComments: true },
		}).outputText;
		expect(transpiled).not.toContain("Shopping action");
		expect(transpiled).not.toContain("injected");
		expect(transpiled).toContain("Sparen");
	}
);

test("description is optional and works without an English message", () => {
	expect(buildBundleDocumentation(catalog().bundles[0]!)).toBe("");
	expect(
		buildBundleDocumentation(catalog("Shopping action.").bundles[0]!)
	).toBe("* Shopping action.\n*\n");
});

test("description-only updates refresh generated JavaScript and declarations", async () => {
	const initial = catalog("Old guidance");
	const previous = await generateCatalog({
		catalog: initial,
		update: { type: "reset", ...initial, diagnostics: [] },
		options,
	});
	const next = catalog("New guidance");
	const updated = await generateCatalog({
		catalog: next,
		previousCatalog: initial,
		previous,
		options,
		update: {
			type: "update",
			bundles: next.bundles,
			removedBundleIds: [],
			diagnostics: [],
		},
	});
	const fresh = await compileCatalog({
		catalog: next,
		projectPath: options.project,
		compilerOptions: options,
	});
	expect(updated.output).toEqual(fresh);
	expect(updated.output["messages/save.js"]).toContain("New guidance");
	expect(updated.output["messages/save.d.ts"]).toContain("New guidance");
	expect(updated.output["messages/_index.d.ts"]).toContain("New guidance");
	expect(JSON.stringify(updated.output)).not.toContain("Old guidance");
});
