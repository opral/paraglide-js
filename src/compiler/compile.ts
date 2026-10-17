import { loadProjectFromDirectory } from "@inlang/sdk";
import path from "node:path";
import { compileProject } from "./compile-project.js";
import { writeOutput } from "../services/file-handling/write-output.js";
import {
	defaultCompilerOptions,
	type CompilerOptions,
} from "./compiler-options.js";
import { Logger } from "../services/logger/index.js";

// This is a workaround to prevent multiple compilations from running at the same time.
// https://github.com/opral/inlang-paraglide-js/issues/320#issuecomment-2596951222
let compilationInProgress: Promise<{
	outputHashes: Record<string, string> | undefined;
}> | null = null;

export type CompilationResult = {
	outputHashes: Record<string, string> | undefined;
};

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
export async function compile(
	options: CompilerOptions & {
		previousCompilation?: CompilationResult;
	}
): Promise<CompilationResult> {
	const withDefaultOptions = {
		...defaultCompilerOptions,
		...options,
	};

	if (compilationInProgress) {
		await compilationInProgress;
	}

	compilationInProgress = (async () => {
		try {
			const fs = withDefaultOptions.fs ?? (await import("node:fs"));
			const absoluteOutdir = path.resolve(
				process.cwd(),
				withDefaultOptions.outdir
			);

			const project = await loadProjectFromDirectory({
				path: withDefaultOptions.project,
				fs,
			});

			let failed = false;
			try {
				// Missing files are skipped by the SDK, but unreadable ones would
				// compile into incomplete output that replaces the previous one.
				// The SDK does not export ResourceFileImportError, so match by name.
				const resourceFileErrors = (await project.errors.get()).filter(
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

				const output = await compileProject({
					compilerOptions: withDefaultOptions,
					project,
					projectPath: withDefaultOptions.project,
				});

				const outputHashes = await writeOutput({
					directory: absoluteOutdir,
					output,
					cleanDirectory: withDefaultOptions.cleanOutdir,
					fs: fs.promises,
					previousOutputHashes: options.previousCompilation?.outputHashes,
				});

				const warningsAndErrors = await project.errors.get();

				for (const warningOrError of warningsAndErrors) {
					logger.warn(warningOrError);
				}

				return { outputHashes };
			} catch (error) {
				failed = true;
				throw error;
			} finally {
				try {
					await project.close();
				} catch (error) {
					// Closing must fail an otherwise successful compilation.
					// eslint-disable-next-line no-unsafe-finally
					if (!failed) throw error;
					// Keep the actionable compile/write error if cleanup also fails.
					logger.warn("Failed to close project:", error);
				}
			}
		} catch (e) {
			// release the lock in case of an error
			compilationInProgress = null;
			throw e;
		}
	})();

	const result = structuredClone(await compilationInProgress);
	compilationInProgress = null;

	return result;
}
