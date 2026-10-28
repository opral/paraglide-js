import { beforeEach, expect, test, vi } from "vitest";
import { memfs } from "memfs";
import consola from "consola";
import { compile } from "./compile.js";
import type { CatalogInput } from "./compile-project.js";

const mocks = vi.hoisted(() => ({
	load: vi.fn(),
	database: vi.fn(() => {
		throw new Error("Catalog compilation must not open a database");
	}),
	select: vi.fn(() => {
		throw new Error("Catalog compilation must not query a database");
	}),
}));
vi.mock("./load-sdk-catalog.js", () => ({
	getCatalogLoader: async () => mocks.load,
}));
vi.mock("@inlang/sdk", async (importOriginal) => ({
	...(await importOriginal<typeof import("@inlang/sdk")>()),
	loadProjectCatalog: mocks.load,
	loadProjectFromDirectory: mocks.database,
	selectBundleNested: mocks.select,
}));
const catalog: CatalogInput = {
	settings: { baseLocale: "en", locales: ["en"], modules: [] },
	bundles: [
		{
			id: "greeting",
			declarations: [],
			messages: [
				{
					id: "greeting_en",
					bundle_id: "greeting",
					locale: "en",
					selectors: [],
					variants: [
						{
							id: "greeting_en_0",
							message_id: "greeting_en",
							matches: [],
							pattern: [{ type: "text", value: "Hello" }],
						},
					],
				},
			],
		},
	],
};
beforeEach(() => {
	mocks.load.mockReset();
	mocks.database.mockClear();
	mocks.select.mockClear();
	mocks.load.mockResolvedValue({ ...catalog, diagnostics: [] });
});

test("compile uses the SDK catalog without opening or selecting a project database", async () => {
	const fs = memfs().fs as unknown as typeof import("node:fs");
	const result = await compile({
		project: "/project.inlang",
		outdir: "/output",
		fs,
		emitTsDeclarations: true,
	});
	expect(mocks.load).toHaveBeenCalledWith(
		expect.objectContaining({
			path: "/project.inlang",
			fs,
			writePluginCache: true,
		})
	);
	expect(mocks.database).not.toHaveBeenCalled();
	expect(mocks.select).not.toHaveBeenCalled();
	expect(result.outputHashes).toHaveProperty("messages/greeting.d.ts");
	expect(
		await fs.promises.readFile("/output/messages/greeting.js", "utf8")
	).toContain("Hello");
});

test.each([true, false])(
	"catalog resource diagnostics preserve existing output before writing (clean: %s)",
	async (cleanOutdir) => {
		const fs = memfs({ "/output/keep.txt": "existing output" })
			.fs as unknown as typeof import("node:fs");
		const diagnostic = Object.assign(
			new Error("Unreadable translation resource", {
				cause: Object.assign(new Error("permission denied"), {
					code: "EACCES",
				}),
			}),
			{ name: "ResourceFileImportError", path: "/messages/de.json" }
		);
		mocks.load.mockResolvedValueOnce({ ...catalog, diagnostics: [diagnostic] });
		await expect(
			compile({
				project: "/project.inlang",
				outdir: "/output",
				fs,
				cleanOutdir,
			})
		).rejects.toThrow(/de.json.*EACCES/);
		expect(await fs.promises.readFile("/output/keep.txt", "utf8")).toBe(
			"existing output"
		);
		expect(await fs.promises.readdir("/output")).toEqual(["keep.txt"]);
		// A failed catalog load must release compile()'s serialization lock.
		await expect(
			compile({ project: "/project.inlang", outdir: "/output", fs })
		).resolves.toHaveProperty("outputHashes");
	}
);

test("loader rejection is preserved and allows the next compile", async () => {
	const fs = memfs().fs as unknown as typeof import("node:fs");
	const failure = new Error("Invalid project settings");
	mocks.load.mockRejectedValueOnce(failure);
	await expect(
		compile({ project: "/project.inlang", outdir: "/output", fs })
	).rejects.toBe(failure);
	await expect(
		compile({ project: "/project.inlang", outdir: "/output", fs })
	).resolves.toHaveProperty("outputHashes");
	expect(mocks.database).not.toHaveBeenCalled();
});

test("non-resource catalog diagnostics are still reported", async () => {
	const fs = memfs().fs as unknown as typeof import("node:fs");
	const diagnostic = new Error("Optional plugin warning");
	mocks.load.mockResolvedValueOnce({ ...catalog, diagnostics: [diagnostic] });
	const warn = vi.spyOn(consola, "warn").mockImplementation(() => undefined);
	try {
		await compile({ project: "/project.inlang", outdir: "/output", fs });
		expect(
			warn.mock.calls.some((args) =>
				args.some((arg) => String(arg).includes(diagnostic.message))
			)
		).toBe(true);
	} finally {
		warn.mockRestore();
	}
});
