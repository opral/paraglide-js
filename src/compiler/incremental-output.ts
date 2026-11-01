import { isDeepStrictEqual } from "node:util";
import { compileCatalog, type CatalogInput } from "./compile-project.js";
import type { CompilerOptions } from "./compiler-options.js";
import type { CatalogUpdate } from "@inlang/sdk/catalog";
import { messageModulesIndexDeclaration } from "./emit-ts-declarations.js";
import { toSafeModuleId } from "./safe-module-id.js";
import { moduleIds } from "./output-structure/message-modules.js";

export type GeneratedCatalog = {
	output: Record<string, string>;
	options: unknown;
	canPatch: boolean;
};

/** Reuse independent message modules; global/layout changes use the full emitter. */
export async function generateCatalog(args: {
	catalog: CatalogInput;
	update: CatalogUpdate;
	options: CompilerOptions;
	previous?: GeneratedCatalog;
	previousCatalog?: CatalogInput;
}): Promise<GeneratedCatalog> {
	const { fs: _fs, ...options } = args.options;
	let snapshot: unknown;
	try {
		snapshot = structuredClone(options);
	} catch {
		/* Non-data options use full generation. */
	}
	const canPatch =
		snapshot !== undefined &&
		(options.outputStructure ?? "message-modules") === "message-modules" &&
		(options.messageModuleSize ?? 1) === 1 &&
		!options.experimentalStaticLocale;
	const previous = args.previous;
	if (
		snapshot !== undefined &&
		previous &&
		args.update.type === "update" &&
		!args.update.bundles.length &&
		!args.update.removedBundleIds.length &&
		isDeepStrictEqual(snapshot, previous.options)
	)
		return previous;
	const previousIds = new Set(
		args.previousCatalog?.bundles.map((bundle) => bundle.id)
	);
	const incremental =
		canPatch &&
		previous?.canPatch &&
		args.update.type === "update" &&
		!args.update.removedBundleIds.length &&
		isDeepStrictEqual(snapshot, previous.options) &&
		args.catalog.bundles.length === args.previousCatalog?.bundles.length &&
		args.update.bundles.every((bundle) => previousIds.has(bundle.id));
	if (incremental) {
		if (!args.update.bundles.length) return previous;
		const patch = await compileCatalog({
			catalog: {
				settings: args.catalog.settings,
				bundles: [...args.update.bundles],
			},
			projectPath: options.project,
			compilerOptions: options,
		});
		const output = { ...previous.output };
		// Index and supporting modules depend on the whole catalog. With unchanged
		// keys/settings they retain their previous contents; only bundle modules
		// vary, and the index declaration, which holds every bundle's declarations.
		for (const bundle of args.update.bundles) {
			const name = toSafeModuleId(bundle.id);
			for (const suffix of ["js", "d.ts"]) {
				const file = `messages/${name}.${suffix}`;
				if (Object.hasOwn(patch, file)) output[file] = patch[file]!;
			}
		}
		if (Object.hasOwn(output, "messages/_index.d.ts"))
			output["messages/_index.d.ts"] = messageModulesIndexDeclaration(
				output,
				previousIds.has("default") ? toSafeModuleId("default") : undefined
			);
		return { output, options: snapshot, canPatch: true };
	}
	const output = await compileCatalog({
		catalog: args.catalog,
		projectPath: options.project,
		compilerOptions: options,
	});
	// A patch compiles the changed bundles alone, so the module ids they get may
	// not depend on the other bundles: every bundle must keep its safe module id.
	return {
		output,
		options: snapshot,
		canPatch:
			canPatch &&
			[...moduleIds(args.catalog.bundles.map((bundle) => bundle.id))].every(
				([id, moduleId]) => moduleId === toSafeModuleId(id)
			),
	};
}
