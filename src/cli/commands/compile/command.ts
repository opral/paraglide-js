import { Command } from "commander";
import fs from "node:fs";
import { resolve, relative } from "node:path";
import { Logger } from "../../../services/logger/index.js";
import { DEFAULT_OUTDIR, DEFAULT_PROJECT_PATH } from "../../defaults.js";
import { compile, type CompilationResult } from "../../../compiler/compile.js";
import {
	defaultCompilerOptions,
	type CompilerOptions,
} from "../../../compiler/compiler-options.js";
import {
	createTrackedFs,
	getWatchTargets,
} from "../../../services/file-watching/tracked-fs.js";

export const compileCommand = new Command()
	.name("compile")
	.summary("Compiles inlang Paraglide-JS")
	.requiredOption(
		"--project <path>",
		'The path to the inlang project. Example: "./project.inlang"',
		DEFAULT_PROJECT_PATH
	)
	.requiredOption(
		"--outdir <path>",
		'The path to the output directory. Example: "./src/paraglide"',
		DEFAULT_OUTDIR
	)
	.option(
		"--strategy <items...>",
		[
			"The strategy to be used.",
			"",
			"Example: --strategy cookie globalVariable baseLocale",
			"Read more on https://inlang.com/m/gerre34r/library-inlang-paraglideJs/strategy",
		].join("\n")
	)
	.requiredOption("--silent", "Only log errors to the console", false)
	.option(
		"--emit-ts-declarations",
		"Emit .d.ts files for the generated output (requires the typescript package)",
		defaultCompilerOptions.emitTsDeclarations
	)
	.option(
		"--no-emit-ts-declarations",
		"Do not emit .d.ts files for the generated output"
	)
	.option(
		"--emit-git-ignore",
		"Emit a .gitignore in the output directory",
		defaultCompilerOptions.emitGitIgnore
	)
	.option(
		"--no-emit-git-ignore",
		"Do not emit a .gitignore in the output directory"
	)
	.option(
		"--emit-prettier-ignore",
		"Emit a .prettierignore in the output directory",
		defaultCompilerOptions.emitPrettierIgnore
	)
	.option(
		"--no-emit-prettier-ignore",
		"Do not emit a .prettierignore in the output directory"
	)
	.option(
		"--emit-readme",
		"Emit a README.md in the output directory (helps LLMs understand the generated code)",
		defaultCompilerOptions.emitReadme
	)
	.option(
		"--no-emit-readme",
		"Do not emit README.md in the output directory"
	)
	.option(
		"--is-server <expression>",
		[
			"JavaScript expression for runtime `isServer` (enables server/client tree-shaking).",
			'Quote if the expression contains spaces, e.g. --is-server \'typeof window === "undefined"\'.',
			"Vite SSR example: --is-server 'import.meta.env.SSR'",
		].join(" ")
	)
	.option(
		"--output-structure <structure>",
		[
			'The output structure for compiled messages. Either "message-modules" or "locale-modules".',
			"",
			'"message-modules" gives each message its own module (better tree-shaking).',
			'"locale-modules" bundles messages per locale (fewer files, better for large projects in dev).',
		].join("\n"),
		defaultCompilerOptions.outputStructure
	)
	.option("--watch", "Watch project files and recompile on change", false)
	.action(
		async (options: {
			silent: boolean;
			project: string;
			outdir: string;
			strategy?: CompilerOptions["strategy"];
			emitTsDeclarations?: CompilerOptions["emitTsDeclarations"];
			emitGitIgnore?: CompilerOptions["emitGitIgnore"];
			emitPrettierIgnore?: CompilerOptions["emitPrettierIgnore"];
			emitReadme?: CompilerOptions["emitReadme"];
			isServer?: CompilerOptions["isServer"];
			outputStructure?: CompilerOptions["outputStructure"];
			watch?: boolean;
		}) => {
			const logger = new Logger({ silent: options.silent, prefix: true });
			const path = resolve(process.cwd(), options.project);

			const compileOptions = {
				project: path,
				outdir: options.outdir,
				strategy: options.strategy ?? defaultCompilerOptions.strategy,
				emitTsDeclarations:
					options.emitTsDeclarations ??
					defaultCompilerOptions.emitTsDeclarations,
				emitGitIgnore:
					options.emitGitIgnore ?? defaultCompilerOptions.emitGitIgnore,
				emitPrettierIgnore:
					options.emitPrettierIgnore ??
					defaultCompilerOptions.emitPrettierIgnore,
				emitReadme: options.emitReadme ?? defaultCompilerOptions.emitReadme,
				isServer: options.isServer ?? defaultCompilerOptions.isServer,
				outputStructure:
					options.outputStructure ??
					defaultCompilerOptions.outputStructure,
			};

			if (!options.watch) {
				logger.info(`Compiling inlang project ...`);

				try {
					await compile(compileOptions);
				} catch (e) {
					logger.error("Error while compiling inlang project.");
					logger.error(e);
					process.exit(1);
				}

				logger.success(`Successfully compiled inlang project.`);

				process.exit(0);
			}

			const { fs: trackedFs, readFiles, clearReadFiles } = createTrackedFs();
			const fileWatchers = new Map<string, fs.FSWatcher>();
			const directoryWatchers = new Map<string, fs.FSWatcher>();
			let previousCompilation: CompilationResult | undefined;
			let compileTimer: NodeJS.Timeout | undefined;
			let compileInProgress = false;
			let compileRequested = false;

			const updateWatchers = (files: Set<string>) => {
				const {
					files: nextFiles,
					directories: nextDirectories,
					isIgnoredPath,
				} = getWatchTargets(files, { outdir: options.outdir });

				for (const [filePath, watcher] of fileWatchers) {
					if (!nextFiles.has(filePath)) {
						watcher.close();
						fileWatchers.delete(filePath);
					}
				}

				for (const [directoryPath, watcher] of directoryWatchers) {
					if (!nextDirectories.has(directoryPath)) {
						watcher.close();
						directoryWatchers.delete(directoryPath);
					}
				}

				const attachWatcherErrorHandler = (
					watcher: fs.FSWatcher,
					targetPath: string,
					targetType: "file" | "directory"
				) => {
					watcher.on("error", (error) => {
						logger.warn(
							`Watch ${targetType} error for ${targetPath}: ${(error as Error).message}`
						);
					});
				};

				for (const filePath of nextFiles) {
					if (fileWatchers.has(filePath)) {
						continue;
					}

					try {
						const watcher = fs.watch(filePath, () => {
							scheduleCompile(filePath);
						});
						attachWatcherErrorHandler(watcher, filePath, "file");
						fileWatchers.set(filePath, watcher);
					} catch (error) {
						logger.warn(`Failed to watch file: ${filePath}`);
					}
				}

				for (const directoryPath of nextDirectories) {
					if (directoryWatchers.has(directoryPath)) {
						continue;
					}

					try {
						const watcher = fs.watch(directoryPath, (eventType, filename) => {
							if (!filename) {
								scheduleCompile(directoryPath);
								return;
							}

							const changedPath = resolve(directoryPath, filename.toString());
							if (isIgnoredPath(changedPath)) {
								return;
							}
							scheduleCompile(changedPath);
						});
						attachWatcherErrorHandler(watcher, directoryPath, "directory");
						directoryWatchers.set(directoryPath, watcher);
					} catch (error) {
						logger.warn(`Failed to watch directory: ${directoryPath}`);
					}
				}
			};

			const runCompile = async (changedPath?: string) => {
				if (compileInProgress) {
					compileRequested = true;
					return;
				}

				compileInProgress = true;
				const previouslyReadFiles = new Set(readFiles);
				clearReadFiles();

				if (changedPath) {
					logger.info(
						`Re-compiling inlang project... File "${relative(process.cwd(), changedPath)}" has changed.`
					);
				} else {
					logger.info("Compiling inlang project ...");
				}

				try {
					previousCompilation = await compile({
						...compileOptions,
						fs: trackedFs,
						previousCompilation,
						cleanOutdir: previousCompilation === undefined,
					});

					if (changedPath) {
						logger.success("Re-compilation complete.");
					} else {
						logger.success("Successfully compiled inlang project.");
					}
				} catch (e) {
					if (previouslyReadFiles.size > 0) {
						clearReadFiles();
						for (const filePath of previouslyReadFiles) {
							readFiles.add(filePath);
						}
					}
					previousCompilation = undefined;
					logger.error("Error while compiling inlang project.");
					logger.error(e);
				} finally {
					updateWatchers(readFiles);
					compileInProgress = false;
					if (compileRequested) {
						compileRequested = false;
						runCompile();
					}
				}
			};

			const scheduleCompile = (changedPath?: string) => {
				if (compileTimer) {
					clearTimeout(compileTimer);
				}
				compileTimer = setTimeout(() => {
					runCompile(changedPath);
				}, 100);
			};

			const closeWatchers = () => {
				for (const watcher of fileWatchers.values()) {
					watcher.close();
				}
				for (const watcher of directoryWatchers.values()) {
					watcher.close();
				}
				fileWatchers.clear();
				directoryWatchers.clear();
			};

			process.on("SIGINT", () => {
				closeWatchers();
				process.exit(0);
			});

			await runCompile();
			logger.info("Watching for changes...");
		}
	);
