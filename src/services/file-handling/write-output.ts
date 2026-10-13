import path from "node:path";
import { createHash } from "node:crypto";
import type nodeFs from "node:fs/promises";

// Bound open/write/close lifetimes, not just the filesystem thread pool.
// A worker holds its slot until the whole operation has settled.
// Real-disk profiles favor 4–16 workers over wider queues; eight keeps
// filesystem throughput without thousands of pending promises/descriptors.
const FILE_SYSTEM_CONCURRENCY = 8;

async function forEachConcurrent<T>(
	items: Iterable<T>,
	operation: (item: T) => Promise<unknown>
): Promise<void> {
	const iterator = items[Symbol.iterator]();
	let failed = false;
	let firstError: unknown;

	async function worker(item: T) {
		while (!failed) {
			try {
				await operation(item);
			} catch (error) {
				if (!failed) {
					failed = true;
					firstError = error;
				}
				return;
			}
			if (failed) return;
			const next = iterator.next();
			if (next.done) return;
			item = next.value;
		}
	}

	const workers: Promise<void>[] = [];
	for (let index = 0; index < FILE_SYSTEM_CONCURRENCY; index++) {
		const next = iterator.next();
		if (next.done) break;
		workers.push(worker(next.value));
	}
	// Drain in-flight operations before rejecting, so a retry cannot race
	// writes left over from the failed compilation.
	await Promise.all(workers);
	if (failed) throw firstError;
}

export async function writeOutput(args: {
	directory: string;
	output: Record<string, string>;
	cleanDirectory?: boolean;
	fs: typeof nodeFs;
	previousOutputHashes?: Record<string, string>;
}) {
	const currentOutputHashes = await hashOutput(args.output, args.directory);

	// if the output hasn't changed, don't write it
	const changedFiles = new Set<string>();

	for (const [filePath, hash] of Object.entries(currentOutputHashes)) {
		if (args.previousOutputHashes?.[filePath] !== hash) {
			changedFiles.add(filePath);
		}
	}

	// Find files that have been removed in the current output
	const filesToDelete = new Set<string>();
	if (args.previousOutputHashes) {
		for (const filePath of Object.keys(args.previousOutputHashes)) {
			if (!currentOutputHashes[filePath]) {
				filesToDelete.add(filePath);
			}
		}
	}

	if (changedFiles.size === 0 && filesToDelete.size === 0) {
		return currentOutputHashes;
	}

	// clear the output directory
	//
	// disabled because of https://github.com/opral/inlang-paraglide-js/issues/350
	// and re-enabled because of https://github.com/opral/inlang-paraglide-js/issues/420
	if (args.cleanDirectory) {
		await args.fs.rm(args.directory, { recursive: true, force: true });
	}
	// Delete files that have been removed
	// ignore if cleanDirectory is true because the directory will be cleaned anyway
	if (filesToDelete.size > 0 && !args.cleanDirectory) {
		await deleteRemovedFiles(args.fs, args.directory, filesToDelete);
	}

	// Cleaning removed unchanged files too, so a changed clean compile must
	// rewrite the entire output. An entirely unchanged compile stays a no-op.
	const filesToWrite = args.cleanDirectory
		? Object.keys(args.output)
		: changedFiles;

	// Create only the directories needed by files that are about to be written.
	// On incremental compiles, `output` can contain thousands of unchanged
	// message modules; creating every parent directory again adds avoidable
	// filesystem work even though only a handful of files changed.
	const directoriesToCreate = new Set<string>();
	for (const filePath of filesToWrite) {
		directoriesToCreate.add(
			path.dirname(path.resolve(args.directory, filePath))
		);
	}
	await forEachConcurrent(directoriesToCreate, (directory) =>
		args.fs.mkdir(directory, { recursive: true })
	);

	await forEachConcurrent(filesToWrite, (filePath) =>
		args.fs.writeFile(
			path.resolve(args.directory, filePath),
			args.output[filePath]!
		)
	);

	// Publish hashes only after every required filesystem operation succeeds.
	return currentOutputHashes;
}

/**
 * Delete files that have been removed and clean up empty directories
 */
async function deleteRemovedFiles(
	fs: typeof nodeFs,
	baseDirectory: string,
	filesToDelete: Set<string>
) {
	// Collect directories that might need cleanup
	const potentialEmptyDirs = new Set<string>();

	// First pass: delete all files and collect parent directories
	await forEachConcurrent(filesToDelete, async (filePath) => {
		const fullPath = path.resolve(baseDirectory, filePath);
		try {
			await fs.unlink(fullPath);
		} catch (error) {
			// A previously removed file is already in the desired state.
			if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
		}
		const dirPath = path.dirname(fullPath);
		if (dirPath !== baseDirectory) potentialEmptyDirs.add(dirPath);
	});

	// Second pass: clean up empty directories, starting from deepest paths
	const sortedDirs = Array.from(potentialEmptyDirs).sort(
		(a, b) => b.length - a.length
	);

	for (const dirPath of sortedDirs) {
		// Only process directories within the base directory
		if (!dirPath.startsWith(baseDirectory) || dirPath === baseDirectory) {
			continue;
		}

		try {
			const dirContents = await fs.readdir(dirPath);
			if (dirContents.length === 0) {
				await fs.rmdir(dirPath);

				// Add parent directory for potential cleanup
				const parentDir = path.dirname(dirPath);
				if (parentDir !== baseDirectory) {
					sortedDirs.push(parentDir);
				}
			}
		} catch {
			// Ignore errors during directory cleanup
		}
	}
}

function hashString(input: string): string {
	return createHash("sha256").update(input).digest("hex");
}

async function hashOutput(
	output: Record<string, string>,
	outputDirectory: string
): Promise<Record<string, string>> {
	const entries = Object.entries(output).map(([filePath, fileContent]) => {
		const combinedContent =
			fileContent + path.resolve(outputDirectory, filePath);
		return [filePath, hashString(combinedContent)] as const;
	});
	return Object.fromEntries(entries);
}

/**
 * Walk an existing output directory and produce the same hash map that
 * {@link writeOutput} would have returned on a previous compile.
 *
 * Used by the bundler plugins to seed `previousCompilation` on a fresh
 * process so the first compile's diff against unchanged inputs is empty
 * and `writeOutput` short-circuits — letting us avoid wiping the directory
 * out from under concurrent SSR/prerender readers (#659).
 *
 * Returns `undefined` if the directory does not exist. Keys are
 * forward-slash relative paths to match {@link hashOutput}.
 */
export async function hashDirectory(
	directory: string,
	fs: typeof nodeFs
): Promise<Record<string, string> | undefined> {
	try {
		const stat = await fs.stat(directory);
		if (!stat.isDirectory()) return undefined;
	} catch {
		return undefined;
	}

	const hashes: Record<string, string> = {};

	async function walk(currentDir: string, relativePrefix: string) {
		let entries;
		try {
			entries = await fs.readdir(currentDir, { withFileTypes: true });
		} catch {
			return;
		}
		for (const entry of entries) {
			const entryAbsolutePath = path.resolve(currentDir, entry.name);
			const relativePath = relativePrefix
				? `${relativePrefix}/${entry.name}`
				: entry.name;
			if (entry.isDirectory()) {
				await walk(entryAbsolutePath, relativePath);
			} else if (entry.isFile()) {
				try {
					const fileContent = await fs.readFile(entryAbsolutePath, "utf-8");
					const combinedContent =
						fileContent + path.resolve(directory, relativePath);
					hashes[relativePath] = await hashString(combinedContent);
				} catch {
					// Another compiler process may be rewriting this file. A partial
					// seed is safe; the following compile will repair missing outputs.
				}
			}
		}
	}

	await walk(directory, "");
	return hashes;
}
