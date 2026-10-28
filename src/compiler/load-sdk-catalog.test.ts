import { expect, test, vi } from "vitest";
import { getCatalogLoader } from "./load-sdk-catalog.js";

const missingExport = () =>
	Object.assign(
		new Error(
			"Package subpath './catalog' is not defined by 'exports' in /node_modules/@inlang/sdk/package.json"
		),
		{ code: "ERR_PACKAGE_PATH_NOT_EXPORTED" }
	);
const resolveCatalog = (specifier: string) => specifier;
const oldPackage = (specifier: string): string => {
	if (specifier === "@inlang/sdk/catalog") throw missingExport();
	return specifier;
};

test("loads the narrow catalog entry without importing the SDK root", async () => {
	const loader = vi.fn();
	const importModule = vi.fn(async () => ({ loadProjectCatalog: loader }));
	const resolveModule = vi.fn(resolveCatalog);
	expect(await getCatalogLoader(importModule, resolveModule)).toBe(loader);
	expect(resolveModule.mock.calls).toEqual([["@inlang/sdk/catalog"]]);
	expect(importModule.mock.calls).toEqual([["@inlang/sdk/catalog"]]);
});

test("older packages without the catalog subpath retain their root catalog API", async () => {
	const loader = vi.fn();
	const importModule = vi.fn(async () => ({ loadProjectCatalog: loader }));
	expect(await getCatalogLoader(importModule, oldPackage)).toBe(loader);
	expect(importModule.mock.calls).toEqual([["@inlang/sdk"]]);
});

test.each([
	{},
	{ loadProjectCatalog: undefined },
	{ loadProjectCatalog: "unsupported" },
])(
	"root packages without a callable catalog API use the existing project loader: %j",
	async (module) => {
		const importModule = vi.fn(async () => module);
		expect(await getCatalogLoader(importModule, oldPackage)).toBeUndefined();
		expect(importModule.mock.calls).toEqual([["@inlang/sdk"]]);
	}
);

test("an existing subpath with a missing loader export is a broken package", async () => {
	const importModule = vi.fn(async () => ({}));
	await expect(getCatalogLoader(importModule, resolveCatalog)).rejects.toThrow(
		/catalog/i
	);
	expect(importModule).toHaveBeenCalledTimes(1);
});

for (const failure of [
	new SyntaxError("Unexpected token while evaluating the catalog module"),
	Object.assign(
		new Error(
			"Cannot find package 'transitive-dependency' imported from @inlang/sdk/catalog"
		),
		{ code: "ERR_MODULE_NOT_FOUND" }
	),
	Object.assign(
		new Error(
			"Cannot find module '/node_modules/@inlang/sdk/dist/project/loadProjectCatalog.js'"
		),
		{ code: "MODULE_NOT_FOUND" }
	),
	Object.assign(
		new Error(
			"Package subpath './internal' is not defined by exports in /node_modules/transitive-dependency/package.json"
		),
		{ code: "ERR_PACKAGE_PATH_NOT_EXPORTED" }
	),
	new Error("Catalog module initialization failed"),
]) {
	test(`preserves catalog import failure without loading a fallback: ${failure.message}`, async () => {
		const importModule = vi.fn(async () => {
			throw failure;
		});
		await expect(getCatalogLoader(importModule, resolveCatalog)).rejects.toBe(
			failure
		);
		expect(importModule.mock.calls).toEqual([["@inlang/sdk/catalog"]]);
	});
}

test("resolution failures other than missing package exports propagate without an import", async () => {
	const failure = Object.assign(new Error("Cannot find package @inlang/sdk"), {
		code: "MODULE_NOT_FOUND",
	});
	const importModule = vi.fn(async () => ({}));
	await expect(
		getCatalogLoader(importModule, () => {
			throw failure;
		})
	).rejects.toBe(failure);
	expect(importModule).not.toHaveBeenCalled();
});

test("a root import failure propagates after a genuinely missing subpath", async () => {
	const failure = new Error("SDK root failed to initialize");
	const importModule = vi.fn(async () => {
		throw failure;
	});
	await expect(getCatalogLoader(importModule, oldPackage)).rejects.toBe(
		failure
	);
	expect(importModule.mock.calls).toEqual([["@inlang/sdk"]]);
});
