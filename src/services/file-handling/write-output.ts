import path from "node:path";
import { createHash } from "node:crypto";
import type nodeFs from "node:fs/promises";

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

	// Create only the directories needed by files that are about to be written.
	// On incremental compiles, `output` can contain thousands of unchanged
	// message modules; creating every parent directory again adds avoidable
	// filesystem work even though only a handful of files changed.
	const directoriesToCreate = new Set<string>();
	for (const filePath of changedFiles) {
		directoriesToCreate.add(
			path.dirname(path.resolve(args.directory, filePath))
		);
	}
	await Promise.allSettled(
		Array.from(directoriesToCreate, (directory) =>
			args.fs.mkdir(directory, { recursive: true })
		)
	);

	//Write files
	await Promise.allSettled(
		Object.entries(args.output).map(async ([filePath, fileContent]) => {
			if (!changedFiles.has(filePath)) {
				return;
			}
			const fullPath = path.resolve(args.directory, filePath);
			await args.fs.writeFile(fullPath, fileContent);
		})
	);

	//Only update the previousOutputHashes if the write was successful
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
	await Promise.allSettled(
		Array.from(filesToDelete).map(async (filePath) => {
			const fullPath = path.resolve(baseDirectory, filePath);
			try {
				await fs.unlink(fullPath);

				// Add parent directory for potential cleanup
				const dirPath = path.dirname(fullPath);
				if (dirPath !== baseDirectory) {
					potentialEmptyDirs.add(dirPath);
				}
			} catch {
				// Ignore errors if the file doesn't exist
			}
		})
	);

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
