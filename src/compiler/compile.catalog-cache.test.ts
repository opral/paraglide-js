import { afterEach, expect, test, vi } from "vitest";
import * as sdk from "@inlang/sdk";
import { memfs } from "memfs";
import { compile } from "./compile.js";

const database = vi.hoisted(() =>
	vi.fn(() => {
		throw new Error("Catalog compilation must not open a project database");
	})
);
vi.mock("./load-sdk-catalog.js", () => ({
	getCatalogLoader: async () => {
		const actual =
			await vi.importActual<typeof import("@inlang/sdk")>("@inlang/sdk");
		return Reflect.get(actual, "createCatalogLoader");
	},
}));
vi.mock("@inlang/sdk", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@inlang/sdk")>();
	return {
		...actual,
		createCatalogLoader: Object.hasOwn(actual, "createCatalogLoader")
			? (actual as typeof actual & { createCatalogLoader?: unknown })
					.createCatalogLoader
			: undefined,
		loadProjectFromDirectory: database,
	};
});
afterEach(() => {
	vi.restoreAllMocks();
	database.mockClear();
});

const createCatalogLoader = (
	sdk as typeof sdk & { createCatalogLoader?: unknown }
).createCatalogLoader;
const pluginUri = "https://example.invalid/compiler-cache-plugin.js";
const pluginSource = `export default {
 key: "plugin.fixture.compilerCache",
 toBeImportedFiles: async ({settings}) => settings.locales.map(locale => ({locale, path: "./messages/" + locale + ".json"})),
 importFiles: async ({files}) => {
  const bundles = new Map(), messages = [], variants = [];
  for (const file of files) for (const [id, value] of Object.entries(JSON.parse(new TextDecoder().decode(file.content)))) {
   bundles.set(id, {id, declarations: []});
   messages.push({bundleId:id, locale:file.locale, selectors:[]});
   variants.push({messageBundleId:id, messageLocale:file.locale, matches:[], pattern:[{type:"text", value}]});
  }
  return {bundles:[...bundles.values()], messages, variants};
 }
};`;

// Runs on SDK versions shipping createCatalogLoader. The generic fast path remains
// covered unconditionally by compile.catalog-loader.test.ts on published SDKs.
test.runIf(createCatalogLoader)(
	"an online catalog compile seeds the remote plugin cache for an offline compile",
	async () => {
		const fs = memfs({
			"/project.inlang/settings.json": JSON.stringify({
				baseLocale: "en",
				locales: ["en"],
				modules: [pluginUri],
			}),
			"/messages/en.json": JSON.stringify({ greeting: "Hello online" }),
		}).fs as unknown as typeof import("node:fs");
		const fetch = vi
			.spyOn(globalThis, "fetch")
			.mockResolvedValueOnce(new Response(pluginSource, { status: 200 }))
			.mockRejectedValue(new TypeError("offline"));
		await compile({
			project: "/project.inlang",
			outdir: "/online",
			fs,
			emitTsDeclarations: true,
		});
		const cachedNames = await fs.promises.readdir(
			"/project.inlang/cache/plugins"
		);
		expect(cachedNames).toHaveLength(1);
		const cachePath = `/project.inlang/cache/plugins/${cachedNames[0]}`;
		expect(await fs.promises.readFile(cachePath, "utf8")).toBe(pluginSource);

		// Changing the catalog confirms the next compile imports the current file,
		// rather than reusing the previous compilation's loaded messages.
		await fs.promises.writeFile(
			"/messages/en.json",
			JSON.stringify({ greeting: "Hello offline" })
		);
		const reads = vi.spyOn(fs.promises, "readFile");
		await compile({
			project: "/project.inlang",
			outdir: "/offline",
			fs,
			emitTsDeclarations: true,
		});
		expect(fetch).toHaveBeenCalledTimes(2);
		expect(fetch).toHaveBeenLastCalledWith(pluginUri);
		expect(reads.mock.calls.some(([file]) => String(file) === cachePath)).toBe(
			true
		);
		expect(
			await fs.promises.readFile("/offline/messages/greeting.js", "utf8")
		).toContain("Hello offline");
		expect(
			await fs.promises.readFile("/offline/messages/greeting.d.ts", "utf8")
		).toContain("greeting");
		expect(database).not.toHaveBeenCalled();
	}
);
