import { createCatalogLoader } from "@inlang/sdk/catalog";
import * as sdk from "@inlang/sdk";
import messageFormat from "@inlang/plugin-message-format";
import { memfs } from "memfs";
import { expect, test } from "vitest";
import { generateCatalog } from "./incremental-output.js";

test("SDK companion descriptions reach Paraglide and invalidate generated documentation", async () => {
	const content = (description: string) =>
		JSON.stringify({ version: 1, descriptions: { save: description } });
	const fs = memfs({
		"/project.inlang/settings.json": JSON.stringify({
			baseLocale: "en",
			locales: ["en"],
			modules: [],
			"plugin.inlang.messageFormat": {
				pathPattern: "/messages/{locale}.json",
			},
		}),
		"/messages/en.json": JSON.stringify({ save: "Save" }),
		"/project.inlang/descriptions.json": content("Shopping action"),
	}).fs as unknown as typeof import("node:fs");
	const loader = createCatalogLoader({
		path: "/project.inlang",
		fs,
		providePlugins: [messageFormat as sdk.InlangPlugin],
	});
	const initial = await loader.load();
	if (initial.type !== "reset") throw new Error("Expected initial reset");
	expect(initial.bundles[0]).toHaveProperty("description", "Shopping action");
	const catalog = {
		settings: initial.settings,
		bundles: [...initial.bundles],
	};
	const options = {
		project: "/project.inlang",
		outdir: "/output",
		emitTsDeclarations: true,
	};
	const first = await generateCatalog({ catalog, update: initial, options });
	await fs.promises.writeFile(
		"/project.inlang/descriptions.json",
		content("Revised shopping guidance")
	);
	const update = await loader.load();
	expect(update.type).toBe("update");
	expect(update.bundles).toHaveLength(1);
	const next = { settings: initial.settings, bundles: [...update.bundles] };
	const second = await generateCatalog({
		catalog: next,
		update,
		options,
		previous: first,
		previousCatalog: catalog,
	});
	expect(second.output["messages/save.js"]).toContain(
		"Revised shopping guidance"
	);
	expect(second.output["messages/save.d.ts"]).toContain(
		"Revised shopping guidance"
	);
});

test("native source-locale descriptions reach generated documentation", async () => {
	const fs = memfs({
		"/project.inlang/settings.json": JSON.stringify({
			baseLocale: "en",
			locales: ["en"],
			modules: [],
			"plugin.inlang.messageFormat": {
				pathPattern: "/messages/{locale}.json",
			},
		}),
		"/messages/en.json": JSON.stringify({
			save: [{ description: "Shopping action", match: { "*": "Save" } }],
		}),
	}).fs as unknown as typeof import("node:fs");
	const update = await createCatalogLoader({
		path: "/project.inlang",
		fs,
		providePlugins: [messageFormat as sdk.InlangPlugin],
	}).load();
	if (update.type !== "reset") throw new Error("Expected initial reset");
	expect(update.bundles[0]).toHaveProperty("description", "Shopping action");
	const result = await generateCatalog({
		catalog: { settings: update.settings, bundles: [...update.bundles] },
		update,
		options: {
			project: "/project.inlang",
			outdir: "/output",
			emitTsDeclarations: true,
		},
	});
	expect(result.output["messages/save.js"]).toContain("Shopping action");
	expect(result.output["messages/save.d.ts"]).toContain("Shopping action");
});
