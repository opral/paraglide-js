import type { UnpluginFactory } from "unplugin";
import { compile, type CompilationResult } from "../compiler/compile.js";
import { dirname, relative, resolve } from "node:path";
import { createHash } from "node:crypto";
import nodeFs from "node:fs";
import { Logger } from "../services/logger/index.js";
import { ENV_VARIABLES } from "../services/env-variables/index.js";
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

const PERSISTENT_CACHE_VERSION = 1;

type PersistentCompilationCache = {
	version: typeof PERSISTENT_CACHE_VERSION;
	compilerVersion: string;
	inputsDigest: string;
	readFiles: string[];
	outputHashes: Record<string, string>;
};

function isStringRecord(value: unknown): value is Record<string, string> {
	return (
		typeof value === "object" &&
		value !== null &&
		!Array.isArray(value) &&
		Object.values(value).every((entry) => typeof entry === "string")
	);
}

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

function getCompilerConfig(
	args: CompilerOptions,
	outputStructure: NonNullable<CompilerOptions["outputStructure"]>
) {
	const { fs: _fs, ...serializableArgs } = args;
	void _fs;
	return {
		...serializableArgs,
		outputStructure,
		isServer,
		compilerVersion: ENV_VARIABLES.PARJS_PACKAGE_VERSION,
	};
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
		hash.update(JSON.stringify(getCompilerConfig(args, outputStructure)));
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

function getPersistentCachePath(
	args: CompilerOptions,
	outputStructure: NonNullable<CompilerOptions["outputStructure"]>
): string {
	const absoluteOutdir = resolve(process.cwd(), args.outdir);
	const cacheKey = createHash("sha256")
		.update(
			JSON.stringify({
				absoluteOutdir,
				compilerConfig: getCompilerConfig(args, outputStructure),
			})
		)
		.digest("hex")
		.slice(0, 16);
	return resolve(
		process.cwd(),
		args.project,
		"cache",
		"paraglide-js",
		`${cacheKey}.json`
	);
}

async function readPersistentCache(
	args: CompilerOptions,
	outputStructure: NonNullable<CompilerOptions["outputStructure"]>
): Promise<PersistentCompilationCache | undefined> {
	const fsp = (args.fs ?? nodeFs).promises;
	try {
		const parsed = JSON.parse(
			await fsp.readFile(getPersistentCachePath(args, outputStructure), "utf8")
		) as Partial<PersistentCompilationCache>;
		if (
			parsed.version !== PERSISTENT_CACHE_VERSION ||
			parsed.compilerVersion !== ENV_VARIABLES.PARJS_PACKAGE_VERSION ||
			typeof parsed.inputsDigest !== "string" ||
			!Array.isArray(parsed.readFiles) ||
			parsed.readFiles.some((file) => typeof file !== "string") ||
			!isStringRecord(parsed.outputHashes)
		) {
			return undefined;
		}
		return parsed as PersistentCompilationCache;
	} catch {
		return undefined;
	}
}

async function preparePersistentCacheDirectory(
	args: CompilerOptions,
	outputStructure: NonNullable<CompilerOptions["outputStructure"]>
): Promise<void> {
	try {
		await (args.fs ?? nodeFs).promises.mkdir(
			dirname(getPersistentCachePath(args, outputStructure)),
			{ recursive: true }
		);
	} catch {
		// The cache is an optimization. Read-only projects must still compile.
	}
}

async function writePersistentCache(
	state: PluginState,
	args: CompilerOptions,
	outputStructure: NonNullable<CompilerOptions["outputStructure"]>
): Promise<void> {
	if (
		state.previousInputsDigest === undefined ||
		state.previousCompilation?.outputHashes === undefined
	) {
		return;
	}
	const cachePath = getPersistentCachePath(args, outputStructure);
	const cache: PersistentCompilationCache = {
		version: PERSISTENT_CACHE_VERSION,
		compilerVersion: ENV_VARIABLES.PARJS_PACKAGE_VERSION,
		inputsDigest: state.previousInputsDigest,
		readFiles: [...state.readFiles].sort(),
		outputHashes: state.previousCompilation.outputHashes,
	};
	const fsp = (args.fs ?? nodeFs).promises;
	try {
		await fsp.mkdir(dirname(cachePath), { recursive: true });
		await fsp.writeFile(cachePath, JSON.stringify(cache));
	} catch {
		// The cache is an optimization. Read-only projects must still compile.
	}
}

function outputHashesMatch(
	left: Record<string, string> | undefined,
	right: Record<string, string>
): boolean {
	if (left === undefined) return false;
	const leftEntries = Object.entries(left);
	const rightEntries = Object.entries(right);
	if (leftEntries.length !== rightEntries.length) return false;
	return leftEntries.every(([file, hash]) => right[file] === hash);
}

async function restorePersistentCache(args: {
	state: PluginState;
	compilerOptions: CompilerOptions;
	outputStructure: NonNullable<CompilerOptions["outputStructure"]>;
}): Promise<boolean> {
	const cached = await readPersistentCache(
		args.compilerOptions,
		args.outputStructure
	);
	if (cached === undefined) return false;

	const cachedReadFiles = new Set<string>();
	for (const file of cached.readFiles) {
		cachedReadFiles.add(file);
	}
	const validationState: PluginState = {
		...args.state,
		readFiles: cachedReadFiles,
		clearReadFiles: () => cachedReadFiles.clear(),
	};
	const [inputsDigest, previousCompilation] = await Promise.all([
		computeInputsDigest(
			validationState,
			args.compilerOptions,
			args.outputStructure
		),
		seedPreviousCompilationFromOutdir({
			outdir: args.compilerOptions.outdir,
			fs: args.compilerOptions.fs?.promises,
		}),
	]);
	if (
		inputsDigest !== cached.inputsDigest ||
		!outputHashesMatch(previousCompilation?.outputHashes, cached.outputHashes)
	) {
		return false;
	}

	args.state.clearReadFiles();
	for (const file of cachedReadFiles) {
		args.state.readFiles.add(file);
	}
	args.state.previousCompilation = previousCompilation;
	args.state.previousInputsDigest = inputsDigest;
	return true;
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
				// Stabilize project directory listings before the first digest. The
				// ignored cache directory must not invalidate the cache that creates it.
				await preparePersistentCacheDirectory(args, outputStructure);
				if (
					state.previousCompilation === undefined &&
					(await restorePersistentCache({
						state,
						compilerOptions: args,
						outputStructure,
					}))
				) {
					logger.info(
						`Compilation skipped — inputs unchanged (${outputStructure})`
					);
					return;
				}
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
				await writePersistentCache(state, args, outputStructure);
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
				await writePersistentCache(state, args, outputStructure);

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
