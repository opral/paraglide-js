import {
	generateCatalog,
	type GeneratedCatalog,
} from "./incremental-output.js";
import type nodeFs from "node:fs";
import {
	getCatalogLoader,
	type CatalogLoaderFactory,
	type CatalogLoader,
	type CatalogUpdate,
} from "./load-sdk-catalog.js";
import path from "node:path";
import { compileProject, type CatalogInput } from "./compile-project.js";
import { writeOutput } from "../services/file-handling/write-output.js";
import {
	defaultCompilerOptions,
	type CompilerOptions,
} from "./compiler-options.js";
import { Logger } from "../services/logger/index.js";

// Serialize the entire operation, including publication and failure recovery.
let compilationQueue: Promise<void> = Promise.resolve();

export type CompilationResult = {
	outputHashes: Record<string, string> | undefined;
};

type CatalogState = {
	factory: CatalogLoaderFactory;
	loader: CatalogLoader;
	path: string;
	fs: typeof nodeFs;
	catalog: CatalogInput & { diagnostics: readonly Error[] };
	generated?: GeneratedCatalog;
	hashes?: Record<string, string>;
	directory: string;
};
// State follows a successful compilation and is collected when callers drop it.
const catalogStates = new WeakMap<CompilationResult, CatalogState>();
const publications = new WeakMap<
	CompilationResult,
	{ fs: typeof nodeFs; directory: string }
>();
const invalidPublications = new WeakSet<CompilationResult>();

// Match the SDK's binary identity order when inserting newly added bundles.
function bundleIdentity(id: string) {
	return Buffer.from(
		id.includes("\0") || id.startsWith("lixid1:")
			? "lixid1:" + Buffer.from(id).toString("base64url")
			: id
	);
}

const logger = new Logger();

/**
 * Loads, compiles, and writes the output to disk.
 *
 * This is the main function to use when you want to compile a project.
 * If you want to adjust inlang project loading, or the output, use
 * `compileProject()` instead.
 *
 * @example
 *   await compile({
 *     project: 'path/to/project',
 *     outdir: 'path/to/output',
 *   })
 */
export function compile(
	options: CompilerOptions & { previousCompilation?: CompilationResult }
): Promise<CompilationResult> {
	const result = compilationQueue.then(() => compileUnlocked(options));
	compilationQueue = result.then(
		() => undefined,
		() => undefined
	);
	return result;
}

async function compileUnlocked(
	options: CompilerOptions & { previousCompilation?: CompilationResult }
): Promise<CompilationResult> {
	const withDefaultOptions = {
		...defaultCompilerOptions,
		...options,
	};

	let nextCatalogState: CatalogState | undefined;
	let publicationStarted = false;
	let publication: { fs: typeof nodeFs; directory: string } | undefined;
	const compilation = (async () => {
		try {
			const fs = withDefaultOptions.fs ?? (await import("node:fs"));
			const absoluteOutdir = path.resolve(
				process.cwd(),
				withDefaultOptions.outdir
			);

			// Keep the published SDK range usable until the catalog API is released.
			// A locally linked SDK (or a later compatible release) takes this path.
			publication = { fs, directory: absoluteOutdir };
			const factory = await getCatalogLoader();
			let update: CatalogUpdate | undefined;
			let prior: CatalogState | undefined;
			let catalog: CatalogState["catalog"] | undefined;
			if (factory) {
				const projectPath = path.resolve(withDefaultOptions.project);
				prior = options.previousCompilation
					? catalogStates.get(options.previousCompilation)
					: undefined;
				if (options.previousCompilation)
					catalogStates.delete(options.previousCompilation);
				const reusable =
					prior !== undefined &&
					prior.factory === factory &&
					prior.path === projectPath &&
					prior.fs === fs;
				const loader =
					reusable && prior
						? prior.loader
						: factory({ path: projectPath, fs, writePluginCache: true });
				update = await loader.load();
				if (update.type === "reset") {
					catalog = {
						settings: update.settings,
						bundles: [...update.bundles],
						diagnostics: update.diagnostics,
					};
				} else {
					if (!reusable || !prior)
						throw new Error("A new catalog loader must start with a reset");
					if (!update.bundles.length && !update.removedBundleIds.length) {
						catalog = { ...prior.catalog, diagnostics: update.diagnostics };
					} else {
						const bundles = new Map(
							prior.catalog.bundles.map((bundle) => [bundle.id, bundle])
						);
						const added = update.bundles.some(
							(bundle) => !bundles.has(bundle.id)
						);
						for (const id of update.removedBundleIds) bundles.delete(id);
						for (const bundle of update.bundles) bundles.set(bundle.id, bundle);
						const ordered = added
							? [...bundles.values()]
									.map((bundle) => ({
										bundle,
										identity: bundleIdentity(bundle.id),
									}))
									.sort((a, b) => Buffer.compare(a.identity, b.identity))
									.map((entry) => entry.bundle)
							: [...bundles.values()];
						catalog = {
							settings: prior.catalog.settings,
							bundles: ordered,
							diagnostics: update.diagnostics,
						};
					}
				}
				nextCatalogState = {
					factory,
					loader,
					path: projectPath,
					fs,
					catalog,
					directory: absoluteOutdir,
				};
			}

			const project = catalog
				? undefined
				: await (
						await import("@inlang/sdk")
					).loadProjectFromDirectory({
						path: withDefaultOptions.project,
						fs,
					});
			const diagnostics = () =>
				catalog ? Promise.resolve(catalog.diagnostics) : project!.errors.get();

			let failed = false;
			try {
				// Missing files are skipped by the SDK, but unreadable ones would
				// compile into incomplete output that replaces the previous one.
				// The SDK does not export ResourceFileImportError, so match by name.
				const resourceFileErrors = (await diagnostics()).filter(
					(error) => error.name === "ResourceFileImportError"
				);
				if (resourceFileErrors.length > 0) {
					const failures = resourceFileErrors.map((error) => {
						const { path: file } = error as Error & { path?: string };
						const cause = error.cause as { code?: string } | undefined;
						return `${file} (${cause?.code ?? String(error.cause)})`;
					});
					throw new AggregateError(
						resourceFileErrors,
						`Failed to read translation resource files: ${failures.join(", ")}`
					);
				}

				const { previousCompilation: _previous, ...generationOptions } =
					withDefaultOptions;
				const generated =
					catalog && update
						? await generateCatalog({
								catalog,
								update,
								options: generationOptions,
								previous: prior?.generated,
								previousCatalog: prior?.catalog,
							})
						: undefined;
				const output =
					generated?.output ??
					(await compileProject({
						compilerOptions: withDefaultOptions,
						project: project!,
						projectPath: withDefaultOptions.project,
					}));
				if (nextCatalogState) nextCatalogState.generated = generated;
				const previous = options.previousCompilation;
				const previousPublication = previous
					? publications.get(previous)
					: undefined;
				const compatible =
					previous &&
					!invalidPublications.has(previous) &&
					(!previousPublication ||
						(previousPublication.fs === fs &&
							previousPublication.directory === absoluteOutdir));
				publicationStarted = true;
				const outputHashes = await writeOutput({
					directory: absoluteOutdir,
					output,
					cleanDirectory: withDefaultOptions.cleanOutdir,
					fs: fs.promises,
					previousOutputHashes: compatible ? previous.outputHashes : undefined,
					previousOutput:
						compatible &&
						prior &&
						prior.fs === fs &&
						prior.directory === absoluteOutdir &&
						prior.generated &&
						prior.hashes
							? { files: prior.generated.output, hashes: prior.hashes }
							: undefined,
				});

				if (nextCatalogState) nextCatalogState.hashes = outputHashes;

				const warningsAndErrors = await diagnostics();

				for (const warningOrError of warningsAndErrors) {
					logger.warn(warningOrError);
				}

				return { outputHashes };
			} catch (error) {
				failed = true;
				throw error;
			} finally {
				try {
					await project?.close();
				} catch (error) {
					// Closing must fail an otherwise successful compilation.
					// eslint-disable-next-line no-unsafe-finally
					if (!failed) throw error;
					// Keep the actionable compile/write error if cleanup also fails.
					logger.warn("Failed to close project:", error);
				}
			}
		} catch (e) {
			// A failed clean or partial write can invalidate the old disk hashes.
			if (publicationStarted && options.previousCompilation)
				invalidPublications.add(options.previousCompilation);
			throw e;
		}
	})();

	const result = structuredClone(await compilation);
	if (publication) publications.set(result, publication);
	if (nextCatalogState) catalogStates.set(result, nextCatalogState);

	return result;
}
