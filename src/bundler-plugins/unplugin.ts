import type { UnpluginFactory } from "unplugin";
import { compile, type CompilationResult } from "../compiler/compile.js";
import { dirname, join, relative, resolve } from "node:path";
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
import {
	CONFIG_FILE_NAMES,
	clearParaglideConfigCache,
	isConfigFileName,
	loadParaglideConfig,
	resolveCompilerOptions,
	resolveConfigCandidate,
	type LoadedParaglideConfig,
} from "../services/config/index.js";

const PLUGIN_NAME = "unplugin-paraglide-js";

/**
 * The options accepted by the paraglide bundler plugins.
 *
 * `project` is required — the path to your inlang project directory, which
 * also hosts the paraglide config file (`<project>/paraglide.config.*`).
 * Relative paths are resolved against the tool's project root (Vite `root`,
 * webpack/rspack `context`, else the process working directory).
 *
 * Every other property is optional: values that are not provided are read
 * from the config file, and anything still missing falls back to the
 * built-in defaults.
 *
 * @example
 * ```ts
 * paraglideVitePlugin({ project: "./project.inlang" })
 *
 * // Explicit options win over the config file
 * paraglideVitePlugin({
 *   project: "./project.inlang",
 *   outdir: "./src/paraglide-custom",
 * })
 * ```
 */
export type ParaglidePluginOptions = Omit<
	Partial<CompilerOptions>,
	"project"
> & {
	/**
	 * Required — the path to your inlang project directory, which also
	 * hosts the paraglide config file (`<project>/paraglide.config.*`).
	 * Relative paths are resolved against the tool's project root (Vite
	 * `root`, webpack/rspack `context`, else the process working directory).
	 */
	project: string;
};

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
	previousProject: string | undefined;
	previousOutdir: string | undefined;
};

// Module-scoped so the warm state survives plugin re-instantiation within
// one process (e.g. a vite config reload), but recreated when a different
// fs is passed — the tracked wrapper, read set, and cached compilation are
// only valid for the filesystem they were produced from.
let pluginState: PluginState | undefined;

function getPluginState(args: Pick<CompilerOptions, "fs">): PluginState {
	if (pluginState === undefined || pluginState.baseFs !== args.fs) {
		const tracked = createTrackedFs({ fs: args.fs });
		pluginState = {
			baseFs: args.fs,
			trackedFs: tracked.fs,
			readFiles: tracked.readFiles,
			clearReadFiles: tracked.clearReadFiles,
			previousCompilation: undefined,
			previousInputsDigest: undefined,
			previousProject: undefined,
			previousOutdir: undefined,
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

// default to locale-modules for development to speed up the dev server
// https://github.com/opral/inlang-paraglide-js/issues/486
function resolveOutputStructure(
	options: CompilerOptions
): "message-modules" | "locale-modules" {
	const isProduction = process.env.NODE_ENV === "production";
	return (
		options.outputStructure ??
		(isProduction ? "message-modules" : "locale-modules")
	);
}

function hasUnchangedInputs(args: {
	state: PluginState;
	compilerOptions: CompilerOptions;
	outputStructure: "message-modules" | "locale-modules";
}): Promise<boolean> {
	if (args.state.previousCompilation === undefined) {
		return Promise.resolve(false);
	}
	if (args.state.previousInputsDigest === undefined) {
		return Promise.resolve(false);
	}
	return computeInputsDigest(
		args.state,
		args.compilerOptions,
		args.outputStructure
	).then((currentDigest) => currentDigest === args.state.previousInputsDigest);
}

function maybeInvalidateForOptionsChange(
	state: PluginState,
	compilerOptions: CompilerOptions
): void {
	if (
		state.previousProject !== undefined &&
		(state.previousProject !== compilerOptions.project ||
			state.previousOutdir !== compilerOptions.outdir)
	) {
		state.previousCompilation = undefined;
		state.previousInputsDigest = undefined;
		state.clearReadFiles();
	}
	state.previousProject = compilerOptions.project;
	state.previousOutdir = compilerOptions.outdir;
}

// Compiles and stores the result plus its inputs digest on the plugin
// state. Callers decide whether to persist the compilation cache.
async function compileAndUpdateState(args: {
	state: PluginState;
	compilerOptions: CompilerOptions;
	outputStructure: "message-modules" | "locale-modules";
	previousCompilation: CompilationResult | undefined;
	/**
	 * The `isServer` expression to bake into the compiled runtime.
	 * Webpack omits it and relies on the compiler default.
	 */
	isServer: string | undefined;
}): Promise<void> {
	args.state.previousCompilation = await compile({
		previousCompilation: args.previousCompilation,
		outputStructure: args.outputStructure,
		isServer: args.isServer,
		...withoutCleanOutdir(args.compilerOptions),
		cleanOutdir: false,
		// after the options spread so a user-provided fs doesn't bypass
		// the read tracking (trackedFs wraps options.fs when provided)
		fs: args.state.trackedFs,
	});
	args.state.previousInputsDigest = await computeInputsDigest(
		args.state,
		args.compilerOptions,
		args.outputStructure
	);
}

/**
 * Runs the compilation with the given, already-resolved options. Shared by
 * buildStart and watch-mode rebuilds.
 */
async function runCompilation(args: {
	state: PluginState;
	compilerOptions: CompilerOptions;
}): Promise<void> {
	const compilerOptions = args.compilerOptions;
	const { state } = args;
	const outputStructure = resolveOutputStructure(compilerOptions);
	maybeInvalidateForOptionsChange(state, compilerOptions);
	try {
		// Stabilize project directory listings before the first digest. The
		// ignored cache directory must not invalidate the cache that creates it.
		await preparePersistentCacheDirectory(compilerOptions, outputStructure);
		if (
			state.previousCompilation === undefined &&
			(await restorePersistentCache({
				state,
				compilerOptions,
				outputStructure,
			}))
		) {
			logger.info(
				`Compilation skipped — inputs unchanged (${outputStructure})`
			);
			return;
		}
		if (
			await hasUnchangedInputs({
				state,
				compilerOptions,
				outputStructure,
			})
		) {
			logger.info(
				`Compilation skipped — inputs unchanged (${outputStructure})`
			);
			return;
		}
		// On a fresh process, seed previousCompilation from on-disk hashes
		// so the first compile is a no-op when inputs are unchanged. Avoids
		// racing concurrent readers that wiping outdir would interrupt.
		const seededPrevious =
			state.previousCompilation ??
			(await seedPreviousCompilationFromOutdir({
				outdir: compilerOptions.outdir,
				fs: compilerOptions.fs?.promises,
			}));
		await compileAndUpdateState({
			state,
			compilerOptions,
			outputStructure,
			previousCompilation: seededPrevious,
			isServer,
		});
		await writePersistentCache(state, compilerOptions, outputStructure);
		logger.success(`Compilation complete (${outputStructure})`);
	} catch (error) {
		state.previousInputsDigest = undefined;
		logger.error("Failed to compile project:", (error as Error).message);
		logger.info("Please check your translation files for syntax errors.");
		if (process.env.NODE_ENV === "production") throw error;
	}
}

// The return type preserves literal option types (`enforce: "pre"`, ...)
// while `project` stays required on the input side.
type UnpluginFactoryWithOptions = (
	userArgs: ParaglidePluginOptions
) => ReturnType<UnpluginFactory<ParaglidePluginOptions>>;

export const unpluginFactory: UnpluginFactoryWithOptions = (userArgs) => {
	const state = getPluginState(userArgs);
	const { readFiles, clearReadFiles } = state;
	// Project root as reported by the bundler (vite `root`, webpack/rspack
	// `context`). Falls back to the process working directory when the
	// bundler doesn't provide one. The config file is resolved inside the
	// project directory.
	let discoveryRoot: string | undefined;
	// Bound to the hook context in buildStart so that watchChange can
	// register additional files.
	let addWatchFile: ((path: string) => void) | undefined;
	// A new plugin instance must not be served by config cache entries
	// from a previous instance (e.g. vite.config.ts reloads reuse the
	// process). Wiping the cache here makes every instance perform one
	// fresh load; subsequent loads within the instance stay cached.
	clearParaglideConfigCache();

	function safeAddWatchFile(
		thisArg: { addWatchFile: (path: string) => void } | undefined,
		path: string
	): void {
		const fn = thisArg?.addWatchFile ?? addWatchFile;
		if (!fn) return;
		if (watchRegistrationUnsupported) return;
		try {
			fn.call(thisArg ?? undefined, path);
		} catch (error) {
			// Watch-file registration is best-effort: backends differ in what
			// they support (unplugin's esbuild context throws for every call),
			// and watcher resource limits can surface as errors. A failed
			// registration must never fail the build.
			watchRegistrationUnsupported = true;
			logger.warn(
				`Registering additional watch files is not supported by this bundler context — skipping further registrations (${(error as Error)?.message ?? String(error)})`
			);
		}
	}

	// Whether a config file was present at the last load — drives the
	// one-time warning when every config candidate disappears.
	let hadActiveConfig = false;
	// Watch-rebuild serialization state (see watchChange).
	let compiling = false;
	const pendingWatchPaths = new Set<string>();
	// Options from the most recent successful resolution — reused by input
	// events that cannot have changed them.
	let lastOptions: CompilerOptions | undefined;
	// Set once a bundler context rejects watch-file registrations (esbuild);
	// further registration attempts are skipped to avoid warning floods.
	let watchRegistrationUnsupported = false;

	const getProjectDir = () =>
		nodeNormalizePath(
			resolve(discoveryRoot ?? process.cwd(), userArgs.project)
		);

	const resolveOptionsWith = (
		loaded: LoadedParaglideConfig | undefined
	): CompilerOptions =>
		resolveCompilerOptions({
			config: loaded?.config,
			overrides: userArgs,
			root: discoveryRoot ?? process.cwd(),
		});

	/**
	 * Loads the active config, following candidate renames and keeping the
	 * last known-good configuration while the file is missing or invalid.
	 * Callers that know the config content changed should clear the cache
	 * for the project directory first.
	 */
	async function loadActiveConfig(): Promise<
		LoadedParaglideConfig | undefined
	> {
		const dir = getProjectDir();
		const winner = await resolveConfigCandidate(dir);
		if (winner === undefined) {
			if (hadActiveConfig) {
				hadActiveConfig = false;
				logger.warn(
					"Paraglide config file was removed, continuing with default options."
				);
			}
			return undefined;
		}
		hadActiveConfig = true;
		// Throws when the file exists but is invalid — callers decide the
		// policy: watch modes skip and surface the error in development,
		// build paths fail loudly in production.
		return loadParaglideConfig({ projectDir: dir, logger });
	}

	/**
	 * Rebuild for a single watch event. Config-named events reload the
	 * config; input events reuse the last known options — options cannot
	 * have changed without a config event.
	 */
	async function performWatchRecompile(path: string): Promise<void> {
		const normalizedPath = nodeNormalizePath(path);
		const projectDir = getProjectDir();
		const withinProjectDir =
			normalizedPath === projectDir ||
			normalizedPath.startsWith(`${projectDir}/`);
		const configEvent = withinProjectDir && isConfigFileName(normalizedPath);

		let args: CompilerOptions;
		if (!configEvent && lastOptions !== undefined) {
			args = lastOptions;
			const targets = getWatchTargets(readFiles, { outdir: args.outdir });
			if (targets.isIgnoredPath(normalizedPath)) return;
			const shouldCompile =
				targets.files.has(normalizedPath) ||
				isPathWithinDirectories(normalizedPath, targets.directories);
			if (!shouldCompile) return;
		} else {
			if (configEvent) {
				logger.info("Paraglide configuration changed, re-compiling.");
				clearParaglideConfigCache({ projectDir });
			}
			try {
				const loaded = await loadActiveConfig();
				args = resolveOptionsWith(loaded);
			} catch (error) {
				// Invalid config: skip the compilation entirely and surface
				// the problem. The previously compiled output stays on disk.
				logger.error((error as Error).message);
				logger.error(
					"Skipping compilation because of the invalid paraglide config."
				);
				return;
			}
			lastOptions = args;
		}

		maybeInvalidateForOptionsChange(state, args);
		const outputStructure = resolveOutputStructure(args);
		const previouslyReadFiles = new Set(readFiles);

		try {
			if (!configEvent) {
				logger.info(
					`Re-compiling inlang project... File "${relative(process.cwd(), path)}" has changed.`
				);
			}

			clearReadFiles();
			await compileAndUpdateState({
				state,
				compilerOptions: args,
				outputStructure,
				previousCompilation: state.previousCompilation,
				isServer,
			});
			await writePersistentCache(state, args, outputStructure);
			logger.success(`Re-compilation complete (${outputStructure})`);

			const nextTargets = getWatchTargets(readFiles, { outdir: args.outdir });
			for (const filePath of nextTargets.files)
				safeAddWatchFile(undefined, filePath);
			for (const directoryPath of nextTargets.directories)
				safeAddWatchFile(undefined, directoryPath);
		} catch (e) {
			clearReadFiles();
			for (const filePath of previouslyReadFiles) readFiles.add(filePath);
			state.previousCompilation = undefined;
			state.previousInputsDigest = undefined;
			logger.warn("Failed to re-compile project:", (e as Error).message);
		}
	}

	return {
		name: PLUGIN_NAME,
		enforce: "pre",
		async buildStart() {
			addWatchFile = this.addWatchFile?.bind(this);
			try {
				const loaded = await loadActiveConfig();
				const args = resolveOptionsWith(loaded);
				lastOptions = args;
				await runCompilation({ state, compilerOptions: args });
			} catch (error) {
				// Config errors are converted to last-good options by
				// loadActiveConfig; compilation errors are handled inside
				// runCompilation. Anything escaping is unexpected — fail the
				// build in production, keep serving in development.
				if (process.env.NODE_ENV === "production") throw error;
				logger.error(
					"Failed to prepare paraglide compilation:",
					(error as Error).message
				);
				return;
			} finally {
				if (lastOptions !== undefined) {
					const targets = getWatchTargets(readFiles, {
						outdir: lastOptions.outdir,
					});
					for (const filePath of targets.files)
						safeAddWatchFile(this, filePath);
					for (const directoryPath of targets.directories)
						safeAddWatchFile(this, directoryPath);
				}
				// Register every config candidate inside the project directory
				// so renames and format switches are reported even by backends
				// that only report watched files (webpack's modifiedFiles).
				const projectDir = getProjectDir();
				for (const name of CONFIG_FILE_NAMES) {
					safeAddWatchFile(
						this as unknown as { addWatchFile: (p: string) => void },
						join(projectDir, name)
					);
				}
			}
		},
		async watchChange(path) {
			// Serialize rebuilds: bundlers may deliver several watchChange
			// events concurrently (webpack fires once per modified file).
			// Every path is queued — a config event must never be starved by
			// later input events.
			pendingWatchPaths.add(nodeNormalizePath(path));
			if (compiling) return;
			compiling = true;
			try {
				while (pendingWatchPaths.size > 0) {
					const batch = [...pendingWatchPaths];
					pendingWatchPaths.clear();
					for (const current of batch) {
						await performWatchRecompile(current);
					}
				}
			} finally {
				compiling = false;
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
			configResolved: {
				handler: (config: { root?: string }) => {
					discoveryRoot = config.root;
				},
			},
		},
		webpack(compiler) {
			discoveryRoot = compiler.context;
			compiler.options.resolve = {
				...compiler.options.resolve,
				fallback: {
					...compiler.options.resolve?.fallback,
					// https://stackoverflow.com/a/72989932
					async_hooks: false,
				},
			};

			compiler.hooks.beforeRun.tapPromise(PLUGIN_NAME, async () => {
				let args: CompilerOptions;
				try {
					const loaded = await loadActiveConfig();
					args = resolveOptionsWith(loaded);
					lastOptions = args;
				} catch (error) {
					state.previousInputsDigest = undefined;
					state.previousCompilation = undefined;
					logger.error(
						"Failed to load paraglide config:",
						(error as Error).message
					);
					if (process.env.NODE_ENV === "production") throw error;
					return;
				}
				const outputStructure = resolveOutputStructure(args);
				maybeInvalidateForOptionsChange(state, args);
				try {
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
					// Multi-compiler webpack setups (client + server) trigger
					// beforeRun once per compiler — skip when inputs are unchanged.
					if (
						await hasUnchangedInputs({
							state,
							compilerOptions: args,
							outputStructure,
						})
					) {
						logger.info(
							`Compilation skipped — inputs unchanged (${outputStructure})`
						);
						return;
					}
					const seededPrevious =
						state.previousCompilation ??
						(await seedPreviousCompilationFromOutdir({
							outdir: args.outdir,
							fs: args.fs?.promises,
						}));
					await compileAndUpdateState({
						state,
						compilerOptions: args,
						outputStructure,
						previousCompilation: seededPrevious,
						// webpack has no vite-style SSR expression; rely on the
						// compiler default.
						isServer: undefined,
					});
					await writePersistentCache(state, args, outputStructure);
					logger.success(`Compilation complete (${outputStructure})`);
				} catch (error) {
					state.previousInputsDigest = undefined;
					logger.warn("Failed to compile project:", (error as Error).message);
					logger.warn("Please check your translation files for syntax errors.");
					if (process.env.NODE_ENV === "production") throw error;
				}
			});
		},
		rspack(compiler) {
			discoveryRoot = compiler.context;
			// Rspack mirrors webpack's hook API but ships no usable types,
			// so hooks are tapped structurally.
			const tapRspackBeforeRun = (fn: () => Promise<void>): void => {
				const target = (
					compiler as unknown as {
						hooks: Record<
							string,
							{ tapPromise?: (n: string, fn: () => Promise<void>) => void }
						>;
					}
				).hooks?.beforeRun;
				target?.tapPromise?.(PLUGIN_NAME, fn);
			};
			tapRspackBeforeRun(async () => {
				let args: CompilerOptions;
				try {
					const loaded = await loadActiveConfig();
					args = resolveOptionsWith(loaded);
					lastOptions = args;
				} catch (error) {
					state.previousInputsDigest = undefined;
					state.previousCompilation = undefined;
					logger.error(
						"Failed to load paraglide config:",
						(error as Error).message
					);
					if (process.env.NODE_ENV === "production") throw error;
					return;
				}
				const outputStructure = resolveOutputStructure(args);
				maybeInvalidateForOptionsChange(state, args);
				try {
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
					if (
						await hasUnchangedInputs({
							state,
							compilerOptions: args,
							outputStructure,
						})
					) {
						logger.info(
							`Compilation skipped — inputs unchanged (${outputStructure})`
						);
						return;
					}
					const seededPrevious =
						state.previousCompilation ??
						(await seedPreviousCompilationFromOutdir({
							outdir: args.outdir,
							fs: args.fs?.promises,
						}));
					await compileAndUpdateState({
						state,
						compilerOptions: args,
						outputStructure,
						previousCompilation: seededPrevious,
						isServer: undefined,
					});
					await writePersistentCache(state, args, outputStructure);
					logger.success(`Compilation complete (${outputStructure})`);
				} catch (error) {
					state.previousInputsDigest = undefined;
					logger.warn("Failed to compile project:", (error as Error).message);
					logger.warn("Please check your translation files for syntax errors.");
					if (process.env.NODE_ENV === "production") throw error;
				}
			});
		},
	};
};
