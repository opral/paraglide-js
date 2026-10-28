import type nodeFs from "node:fs";
import { createRequire } from "node:module";
import type { CatalogInput } from "./compile-project.js";

type CatalogLoader = (args: {
	path: string;
	fs: typeof nodeFs;
	writePluginCache?: boolean;
}) => Promise<CatalogInput & { diagnostics: Error[] }>;

/** Resolve the lightweight SDK API while retaining older published SDK support. */
export async function getCatalogLoader(
	importModule: (specifier: string) => Promise<Record<string, unknown>> = (
		specifier
	) => import(specifier),
	resolveModule: (specifier: string) => unknown = createRequire(import.meta.url)
		.resolve
): Promise<CatalogLoader | undefined> {
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
		const loader = Reflect.get(sdk, "loadProjectCatalog");
		return typeof loader === "function" ? (loader as CatalogLoader) : undefined;
	}
	// A variable specifier supports optional subpaths in bundled Paraglide too.
	const catalog = await importModule("@inlang/sdk/catalog");
	if (typeof catalog.loadProjectCatalog !== "function")
		throw new Error(
			"The SDK catalog entry point does not export loadProjectCatalog"
		);
	return catalog.loadProjectCatalog as CatalogLoader;
}
