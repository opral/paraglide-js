import { beforeEach, expect, test, vi } from "vitest";
import { memfs } from "memfs";
import consola from "consola";
import { compile } from "./compile.js";
import type { CatalogInput } from "./compile-project.js";

const mocks = vi.hoisted(() => ({
	create: vi.fn(),
	load: vi.fn(),
	database: vi.fn(() => {
		throw new Error("Catalog compilation must not open a database");
	}),
	select: vi.fn(() => {
		throw new Error("Catalog compilation must not query a database");
	}),
}));
vi.mock("./load-sdk-catalog.js", () => ({
	getCatalogLoader: async () => mocks.create,
}));
vi.mock("@inlang/sdk", async (importOriginal) => ({
	...(await importOriginal<typeof import("@inlang/sdk")>()),
	createCatalogLoader: mocks.create,
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
	mocks.create.mockReset().mockReturnValue({ load: mocks.load });
	mocks.load.mockReset();
	mocks.database.mockClear();
	mocks.select.mockClear();
	mocks.load.mockResolvedValue({ type: "reset", ...catalog, diagnostics: [] });
});

test("compile uses the SDK catalog without opening or selecting a project database", async () => {
	const fs = memfs().fs as unknown as typeof import("node:fs");
	const result = await compile({
		project: "/project.inlang",
		outdir: "/output",
		fs,
		emitTsDeclarations: true,
	});
	expect(mocks.create).toHaveBeenCalledWith(
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
		mocks.load.mockResolvedValueOnce({
			type: "reset",
			...catalog,
			diagnostics: [diagnostic],
		});
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
	mocks.load.mockResolvedValueOnce({
		type: "reset",
		...catalog,
		diagnostics: [diagnostic],
	});
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

test("reuses the loader and applies additions, replacements and removals in SDK order", async () => {
	const fs = memfs().fs as unknown as typeof import("node:fs");
	const options = {
		project: "/project.inlang",
		outdir: "/output",
		fs,
		cleanOutdir: false,
		emitTsDeclarations: true,
	};
	let previous = await compile(options);
	const added = structuredClone(catalog.bundles[0]!);
	added.id = "aaa";
	added.messages[0]!.bundle_id = "aaa";
	added.messages[0]!.variants[0]!.pattern = [{ type: "text", value: "Added" }];
	mocks.load.mockResolvedValueOnce({
		type: "update",
		bundles: [added],
		removedBundleIds: [],
		diagnostics: [],
	});
	previous = await compile({ ...options, previousCompilation: previous });
	expect(mocks.create).toHaveBeenCalledTimes(1);
	const index = await fs.promises.readFile(
		"/output/messages/_index.js",
		"utf8"
	);
	expect(index.indexOf("aaa")).toBeLessThan(index.indexOf("greeting"));
	expect(
		await fs.promises.readFile("/output/messages/aaa.js", "utf8")
	).toContain("Added");
	const changed = structuredClone(added);
	changed.messages[0]!.variants[0]!.pattern = [
		{ type: "text", value: "Updated" },
	];
	mocks.load.mockResolvedValueOnce({
		type: "update",
		bundles: [changed],
		removedBundleIds: ["greeting"],
		diagnostics: [],
	});
	previous = await compile({ ...options, previousCompilation: previous });
	expect(
		await fs.promises.readFile("/output/messages/aaa.js", "utf8")
	).toContain("Updated");
	expect(fs.existsSync("/output/messages/greeting.js")).toBe(false);
	expect(fs.existsSync("/output/messages/greeting.d.ts")).toBe(false);
	mocks.load.mockResolvedValueOnce({
		type: "update",
		bundles: [],
		removedBundleIds: [],
		diagnostics: [],
	});
	await compile({ ...options, previousCompilation: previous });
	expect(mocks.create).toHaveBeenCalledTimes(1);
});

test("publication failure discards the consumed session so retry starts from a full reset", async () => {
	const fs = memfs().fs as unknown as typeof import("node:fs");
	const options = {
		project: "/project.inlang",
		outdir: "/output",
		fs,
		cleanOutdir: false,
	};
	const previous = await compile(options);
	const changed = structuredClone(catalog.bundles[0]!);
	changed.messages[0]!.variants[0]!.pattern = [
		{ type: "text", value: "Changed" },
	];
	mocks.load.mockResolvedValueOnce({
		type: "update",
		bundles: [changed],
		removedBundleIds: [],
		diagnostics: [],
	});
	const write = vi
		.spyOn(fs.promises, "writeFile")
		.mockRejectedValueOnce(new Error("disk full"));
	await expect(
		compile({ ...options, previousCompilation: previous })
	).rejects.toThrow("disk full");
	write.mockRestore();
	mocks.load.mockResolvedValueOnce({
		type: "reset",
		settings: catalog.settings,
		bundles: [changed],
		diagnostics: [],
	});
	await compile({ ...options, previousCompilation: previous });
	expect(mocks.create).toHaveBeenCalledTimes(2);
	expect(
		await fs.promises.readFile("/output/messages/greeting.js", "utf8")
	).toContain("Changed");
});

test("serializes three callers and continues after the first rejection", async () => {
	const fs = memfs().fs as unknown as typeof import("node:fs");
	let active = 0,
		maxActive = 0,
		calls = 0;
	mocks.load.mockImplementation(async () => {
		active++;
		maxActive = Math.max(maxActive, active);
		const call = calls++;
		try {
			await new Promise((resolve) => setTimeout(resolve, 10));
			if (call === 0) throw new Error("first failed");
			return { type: "reset", ...catalog, diagnostics: [] };
		} finally {
			active--;
		}
	});
	const outcomes = await Promise.allSettled(
		Array.from({ length: 3 }, () =>
			compile({ project: "/project.inlang", outdir: "/output", fs })
		)
	);
	expect(outcomes.map((result) => result.status)).toEqual([
		"rejected",
		"fulfilled",
		"fulfilled",
	]);
	expect(maxActive).toBe(1);
});

test("a failed clean publication is repaired when retrying without cleaning", async () => {
	const fs = memfs().fs as unknown as typeof import("node:fs"),
		options = {
			project: "/project.inlang",
			outdir: "/output",
			fs,
			emitTsDeclarations: true,
			cleanOutdir: false,
		};
	const previous = await compile(options);
	const changed = structuredClone(catalog.bundles[0]!);
	changed.messages[0]!.variants[0]!.pattern = [
		{ type: "text", value: "Updated after failure" },
	];
	mocks.load.mockResolvedValueOnce({
		type: "update",
		bundles: [changed],
		removedBundleIds: [],
		diagnostics: [],
	});
	const write = vi
		.spyOn(fs.promises, "writeFile")
		.mockRejectedValueOnce(new Error("disk full"));
	await expect(
		compile({ ...options, cleanOutdir: true, previousCompilation: previous })
	).rejects.toThrow("disk full");
	write.mockRestore();
	mocks.load.mockResolvedValueOnce({
		type: "reset",
		settings: catalog.settings,
		bundles: [changed],
		diagnostics: [],
	});
	const result = await compile({ ...options, previousCompilation: previous });
	const { hashDirectory } =
		await import("../services/file-handling/write-output.js");
	expect(await hashDirectory("/output", fs.promises)).toEqual(
		result.outputHashes
	);
	expect(
		await fs.promises.readFile("/output/messages/greeting.js", "utf8")
	).toContain("Updated after failure");
});

test("previous hashes cannot suppress output on a different filesystem", async () => {
	const first = memfs().fs as unknown as typeof import("node:fs"),
		second = memfs().fs as unknown as typeof import("node:fs");
	const previous = await compile({
		project: "/project.inlang",
		outdir: "/output",
		fs: first,
	});
	await compile({
		project: "/project.inlang",
		outdir: "/output",
		fs: second,
		previousCompilation: previous,
	});
	expect(
		await second.promises.readFile("/output/messages/greeting.js", "utf8")
	).toContain("Hello");
});

test("callers can invalidate a previous hash without corrupting cached hashes", async () => {
	const fs = memfs().fs as unknown as typeof import("node:fs"),
		options = {
			project: "/project.inlang",
			outdir: "/output",
			fs,
			cleanOutdir: false,
		};
	const previous = await compile(options),
		hash = previous.outputHashes!["messages/greeting.js"];
	delete previous.outputHashes!["messages/greeting.js"];
	await fs.promises.unlink("/output/messages/greeting.js");
	mocks.load.mockResolvedValueOnce({
		type: "update",
		bundles: [],
		removedBundleIds: [],
		diagnostics: [],
	});
	const result = await compile({ ...options, previousCompilation: previous });
	expect(result.outputHashes!["messages/greeting.js"]).toBe(hash);
	expect(
		await fs.promises.readFile("/output/messages/greeting.js", "utf8")
	).toContain("Hello");
});
