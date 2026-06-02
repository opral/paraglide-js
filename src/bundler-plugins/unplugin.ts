import type { UnpluginFactory } from "unplugin";
import { compile, type CompilationResult } from "../compiler/compile.js";
import { relative } from "node:path";
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

let previousCompilation: CompilationResult | undefined;
const { fs: trackedFs, readFiles, clearReadFiles } = createTrackedFs();

function withoutCleanOutdir(
	args: CompilerOptions
): Omit<CompilerOptions, "cleanOutdir"> {
	const { cleanOutdir, ...compileArgs } = args;
	void cleanOutdir;
	return compileArgs;
}

export const unpluginFactory: UnpluginFactory<CompilerOptions> = (args) => ({
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
			// On a fresh process, seed previousCompilation from on-disk hashes
			// so the first compile is a no-op when inputs are unchanged. Avoids
			// racing concurrent readers that wiping outdir would interrupt.
			const seededPrevious =
				previousCompilation ??
				(await seedPreviousCompilationFromOutdir({
					outdir: args.outdir,
					fs: args.fs?.promises,
				}));
			previousCompilation = await compile({
				fs: trackedFs,
				previousCompilation: seededPrevious,
				outputStructure,
				isServer,
				...withoutCleanOutdir(args),
				cleanOutdir: false,
			});
			logger.success(`Compilation complete (${outputStructure})`);
		} catch (error) {
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

			previousCompilation = await compile({
				fs: trackedFs,
				previousCompilation,
				outputStructure,
				isServer,
				...withoutCleanOutdir(args),
				cleanOutdir: false,
			});

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
			previousCompilation = undefined;
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
				const seededPrevious =
					previousCompilation ??
					(await seedPreviousCompilationFromOutdir({
						outdir: args.outdir,
						fs: args.fs?.promises,
					}));
				previousCompilation = await compile({
					fs: trackedFs,
					previousCompilation: seededPrevious,
					outputStructure,
					...withoutCleanOutdir(args),
					cleanOutdir: false,
				});
				logger.success(`Compilation complete (${outputStructure})`);
			} catch (error) {
				logger.warn("Failed to compile project:", (error as Error).message);
				logger.warn("Please check your translation files for syntax errors.");
				if (isProduction) throw error;
			}
		});
	},
});
