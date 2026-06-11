import type { UnpluginFactory } from "unplugin";
import { compile, type CompilationResult } from "../compiler/compile.js";
import { relative } from "node:path";
import { createHash } from "node:crypto";
import nodeFs from "node:fs";
import { Logger } from "../services/logger/index.js";
import type { CompilerOptions } from "../compiler/compiler-options.js";
import {
	createTrackedFs,
	getWatchTargets,
	isPathWithinDirectories,
} from "../services/file-watching/tracked-fs.js";
import { nodeNormalizePath } from "../utilities/node-normalize-path.js";
import { seedPreviousCompilationFromOutdir } from "../compiler/seed-previous-compilation.js";

const PLUGIN_NAME = "unplugin-paraglide-js";

const logger = new Logger();

/**
 * Default isServer which differs per bundler.
 */
let isServer: string | undefined;

type PluginState = {
	/** Identity of the fs the tracked wrapper was created around. */
	baseFs: typeof nodeFs | undefined;
	trackedFs: typeof nodeFs;
	readFiles: Set<string>;
	clearReadFiles: () => void;
	previousCompilation: CompilationResult | undefined;
	/**
	 * Digest of the input files and options of the last successful compilation.
	 *
	 * `vite build` fires `buildStart` once per environment (client, ssr, ...).
	 * When the digest of the current inputs matches, `compile()` is skipped
	 * entirely — project loading and message compilation are expensive even
	 * when `previousCompilation` dedupes the writes.
	 *
	 * https://github.com/opral/paraglide-js/issues/693
	 */
	previousInputsDigest: string | undefined;
};

// Module-scoped so the warm state survives plugin re-instantiation within
// one process (e.g. a vite config reload), but recreated when a different
// fs is passed — the tracked wrapper, read set, and cached compilation are
// only valid for the filesystem they were produced from.
let pluginState: PluginState | undefined;

function getPluginState(args: CompilerOptions): PluginState {
	if (pluginState === undefined || pluginState.baseFs !== args.fs) {
		const tracked = createTrackedFs({ fs: args.fs });
		pluginState = {
			baseFs: args.fs,
			trackedFs: tracked.fs,
			readFiles: tracked.readFiles,
			clearReadFiles: tracked.clearReadFiles,
			previousCompilation: undefined,
			previousInputsDigest: undefined,
		};
	}
	return pluginState;
}

function withoutCleanOutdir(
	args: CompilerOptions
): Omit<CompilerOptions, "cleanOutdir"> {
	const { cleanOutdir, ...compileArgs } = args;
	void cleanOutdir;
	return compileArgs;
}

/**
 * Hashes the files (and directory listings) the last compilation read,
 * together with the options that affect the output. Returns `undefined`
 * when the digest can't be computed (no tracked reads yet, an unexpected
 * read error, ...) — `undefined` never matches, so the caller compiles.
 *
 * Directory listings are included so that a message file *added* next to
 * the tracked ones invalidates the digest, not only edits to known files.
 * All components are length-prefixed so distinct input states can't
 * produce the same hash stream.
 *
 * The digest is taken after the compile, by re-reading the inputs. A file
 * edited *during* a compile can therefore be hashed at its new content
 * while the output reflects the old one — accepted: in dev, watchChange
 * recompiles on that edit, and a fresh build process always recompiles.
 */
async function computeInputsDigest(
	state: PluginState,
	args: CompilerOptions,
	outputStructure: NonNullable<CompilerOptions["outputStructure"]>
): Promise<string | undefined> {
	if (state.readFiles.size === 0) {
		return undefined;
	}
	const targets = getWatchTargets(state.readFiles, { outdir: args.outdir });
	if (targets.files.size === 0) {
		return undefined;
	}
	const fsp = (args.fs ?? nodeFs).promises;
	const hash = createHash("sha256");
	try {
		const { fs: _fs, ...serializableArgs } = args;
		void _fs;
		hash.update(
			JSON.stringify({ ...serializableArgs, outputStructure, isServer })
		);
		for (const directoryPath of [...targets.directories].sort()) {
			const entries = await fsp
				.readdir(directoryPath)
				// tracked reads include probed-but-absent paths (the SDK reads
				// optional files and handles ENOENT itself) — a missing entry
				// is valid input state, hash it as such
				.catch(rethrowUnlessEnoent);
			hash.update(`\0dir:${directoryPath.length}:${directoryPath}:`);
			if (entries === undefined) {
				hash.update("missing");
			} else {
				for (const entry of [...entries].sort()) {
					hash.update(`${entry.length}:${entry},`);
				}
			}
		}
		for (const filePath of [...targets.files].sort()) {
			const content = await fsp.readFile(filePath).catch(rethrowUnlessEnoent);
			hash.update(`\0file:${filePath.length}:${filePath}:`);
			if (content === undefined) {
				hash.update("missing");
			} else {
				hash.update(`${content.length}:`);
				hash.update(content);
			}
		}
	} catch {
		return undefined;
	}
	return hash.digest("hex");
}

function rethrowUnlessEnoent(error: unknown): undefined {
	if ((error as NodeJS.ErrnoException)?.code === "ENOENT") {
		return undefined;
	}
	throw error;
}

export const unpluginFactory: UnpluginFactory<CompilerOptions> = (args) => {
	const state = getPluginState(args);
	const { trackedFs, readFiles, clearReadFiles } = state;
	return {
		name: PLUGIN_NAME,
		enforce: "pre",
		async buildStart() {
			const isProduction = process.env.NODE_ENV === "production";
			// default to locale-modules for development to speed up the dev server
			// https://github.com/opral/inlang-paraglide-js/issues/486
			const outputStructure =
				args.outputStructure ??
				(isProduction ? "message-modules" : "locale-modules");
			try {
				// `vite build` calls buildStart once per environment (client, ssr).
				// Skip the expensive compile when the inputs haven't changed.
				if (state.previousCompilation && state.previousInputsDigest) {
					const currentDigest = await computeInputsDigest(
						state,
						args,
						outputStructure
					);
					if (currentDigest === state.previousInputsDigest) {
						logger.info(
							`Compilation skipped — inputs unchanged (${outputStructure})`
						);
						return;
					}
				}
				// On a fresh process, seed previousCompilation from on-disk hashes
				// so the first compile is a no-op when inputs are unchanged. Avoids
				// racing concurrent readers that wiping outdir would interrupt.
				const seededPrevious =
					state.previousCompilation ??
					(await seedPreviousCompilationFromOutdir({
						outdir: args.outdir,
						fs: args.fs?.promises,
					}));
				state.previousCompilation = await compile({
					previousCompilation: seededPrevious,
					outputStructure,
					isServer,
					...withoutCleanOutdir(args),
					cleanOutdir: false,
					// after the args spread so a user-provided fs doesn't bypass
					// the read tracking (trackedFs wraps args.fs when provided)
					fs: trackedFs,
				});
				state.previousInputsDigest = await computeInputsDigest(
					state,
					args,
					outputStructure
				);
				logger.success(`Compilation complete (${outputStructure})`);
			} catch (error) {
				state.previousInputsDigest = undefined;
				logger.error("Failed to compile project:", (error as Error).message);
				logger.info("Please check your translation files for syntax errors.");
				if (isProduction) throw error;
			} finally {
				// in any case add the files to watch
				const targets = getWatchTargets(readFiles, { outdir: args.outdir });
				for (const filePath of targets.files) {
					this.addWatchFile(filePath);
				}
				for (const directoryPath of targets.directories) {
					this.addWatchFile(directoryPath);
				}
			}
		},
		async watchChange(path) {
			const normalizedPath = nodeNormalizePath(path);
			const targets = getWatchTargets(readFiles, { outdir: args.outdir });
			if (targets.isIgnoredPath(normalizedPath)) {
				return;
			}
			const shouldCompile =
				targets.files.has(normalizedPath) ||
				isPathWithinDirectories(normalizedPath, targets.directories);
			if (shouldCompile === false) {
				return;
			}

			const isProduction = process.env.NODE_ENV === "production";

			// default to locale-modules for development to speed up the dev server
			// https://github.com/opral/inlang-paraglide-js/issues/486
			const outputStructure =
				args.outputStructure ??
				(isProduction ? "message-modules" : "locale-modules");

			const previouslyReadFiles = new Set(readFiles);

			try {
				logger.info(
					`Re-compiling inlang project... File "${relative(process.cwd(), path)}" has changed.`
				);

				// Clear readFiles to track fresh file reads
				clearReadFiles();

				state.previousCompilation = await compile({
					previousCompilation: state.previousCompilation,
					outputStructure,
					isServer,
					...withoutCleanOutdir(args),
					cleanOutdir: false,
					fs: trackedFs,
				});
				state.previousInputsDigest = await computeInputsDigest(
					state,
					args,
					outputStructure
				);

				logger.success(`Re-compilation complete (${outputStructure})`);

				// Add any new files to watch
				const nextTargets = getWatchTargets(readFiles, { outdir: args.outdir });
				for (const filePath of nextTargets.files) {
					this.addWatchFile(filePath);
				}
				for (const directoryPath of nextTargets.directories) {
					this.addWatchFile(directoryPath);
				}
			} catch (e) {
				clearReadFiles();
				for (const filePath of previouslyReadFiles) {
					readFiles.add(filePath);
				}
				// Reset compilation result on error
				state.previousCompilation = undefined;
				state.previousInputsDigest = undefined;
				logger.warn("Failed to re-compile project:", (e as Error).message);
			}
		},
		vite: {
			config: {
				handler: () => {
					isServer = "import.meta.env?.SSR ?? typeof window === 'undefined'";
				},
			},
			configEnvironment: {
				handler: () => {
					isServer = "import.meta.env?.SSR ?? typeof window === 'undefined'";
				},
			},
		},
		webpack(compiler) {
			compiler.options.resolve = {
				...compiler.options.resolve,
				fallback: {
					...compiler.options.resolve?.fallback,
					// https://stackoverflow.com/a/72989932
					async_hooks: false,
				},
			};

			compiler.hooks.beforeRun.tapPromise(PLUGIN_NAME, async () => {
				const isProduction = process.env.NODE_ENV === "production";
				// default to locale-modules for development to speed up the dev server
				// https://github.com/opral/inlang-paraglide-js/issues/486
				const outputStructure =
					args.outputStructure ??
					(isProduction ? "message-modules" : "locale-modules");
				try {
					// Multi-compiler webpack setups (client + server) trigger
					// beforeRun once per compiler — skip when inputs are unchanged.
					if (state.previousCompilation && state.previousInputsDigest) {
						const currentDigest = await computeInputsDigest(
							state,
							args,
							outputStructure
						);
						if (currentDigest === state.previousInputsDigest) {
							logger.info(
								`Compilation skipped — inputs unchanged (${outputStructure})`
							);
							return;
						}
					}
					const seededPrevious =
						state.previousCompilation ??
						(await seedPreviousCompilationFromOutdir({
							outdir: args.outdir,
							fs: args.fs?.promises,
						}));
					state.previousCompilation = await compile({
						previousCompilation: seededPrevious,
						outputStructure,
						...withoutCleanOutdir(args),
						cleanOutdir: false,
						fs: trackedFs,
					});
					state.previousInputsDigest = await computeInputsDigest(
						state,
						args,
						outputStructure
					);
					logger.success(`Compilation complete (${outputStructure})`);
				} catch (error) {
					state.previousInputsDigest = undefined;
					logger.warn("Failed to compile project:", (error as Error).message);
					logger.warn("Please check your translation files for syntax errors.");
					if (isProduction) throw error;
				}
			});
		},
	};
};
