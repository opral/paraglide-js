import type nodeFs from "node:fs";
import { createRequire } from "node:module";
import type { CatalogInput } from "./compile-project.js";

export type CatalogUpdate =
	| {
			settings: CatalogInput["settings"];
			type: "reset";
			bundles: readonly CatalogInput["bundles"][number][];
			diagnostics: readonly Error[];
	  }
	| {
			type: "update";
			bundles: readonly CatalogInput["bundles"][number][];
			removedBundleIds: readonly string[];
			diagnostics: readonly Error[];
	  };
export type CatalogLoader = { load(): Promise<CatalogUpdate> };
export type CatalogLoaderFactory = (args: {
	path: string;
	fs: typeof nodeFs;
	writePluginCache?: boolean;
}) => CatalogLoader;

/** Resolve the lightweight SDK API while retaining older published SDK support. */
export async function getCatalogLoader(
	importModule: (specifier: string) => Promise<Record<string, unknown>> = (
		specifier
	) => import(specifier),
	resolveModule: (specifier: string) => unknown = createRequire(import.meta.url)
		.resolve
): Promise<CatalogLoaderFactory | undefined> {
	try {
		// Resolve separately so missing exports inside a dependency cannot hide a
		// broken catalog entry point by silently selecting the legacy loader.
		resolveModule("@inlang/sdk/catalog");
	} catch (error) {
		if (
			(error as NodeJS.ErrnoException).code !== "ERR_PACKAGE_PATH_NOT_EXPORTED"
		)
			throw error;
		const sdk = await importModule("@inlang/sdk");
		const loader = Reflect.get(sdk, "createCatalogLoader");
		return typeof loader === "function"
			? (loader as CatalogLoaderFactory)
			: undefined;
	}
	// A variable specifier supports optional subpaths in bundled Paraglide too.
	const catalog = await importModule("@inlang/sdk/catalog");
	if (typeof catalog.createCatalogLoader !== "function")
		throw new Error(
			"The SDK catalog entry point does not export createCatalogLoader"
		);
	return catalog.createCatalogLoader as CatalogLoaderFactory;
}
