import fs from "node:fs";
import { dirname, resolve } from "node:path";
import { nodeNormalizePath } from "../../utilities/node-normalize-path.js";

type TrackedFs = {
	fs: typeof import("node:fs");
	readFiles: Set<string>;
	clearReadFiles: () => void;
};

type TrackedFsOptions = {
	baseDir?: string;
	fs?: typeof import("node:fs");
};

type WatchTargetOptions = {
	baseDir?: string;
	outdir?: string;
	ignoreCache?: boolean;
	includeDirectories?: boolean;
	ignorePath?: (path: string) => boolean;
};

type WatchTargets = {
	files: Set<string>;
	directories: Set<string>;
	isIgnoredPath: (path: string) => boolean;
};

export function isPathWithinDirectories(
	path: string,
	directories: Iterable<string>
): boolean {
	const normalizedPath = nodeNormalizePath(path);
	for (const directory of directories) {
		const normalizedDirectory = nodeNormalizePath(directory);
		if (
			normalizedPath === normalizedDirectory ||
			normalizedPath.startsWith(`${normalizedDirectory}/`)
		) {
			return true;
		}
	}
	return false;
}

export function getWatchTargets(
	files: Iterable<string>,
	options: WatchTargetOptions = {}
): WatchTargets {
	const baseDir = options.baseDir ?? process.cwd();
	const outdirPath = options.outdir
		? nodeNormalizePath(resolve(baseDir, options.outdir))
		: undefined;
	const ignoreCache = options.ignoreCache ?? true;
	const includeDirectories = options.includeDirectories ?? true;
	const ignorePath = options.ignorePath;

	const isIgnoredPath = (path: string) => {
		const normalizedPath = nodeNormalizePath(path);
		if (ignoreCache && normalizedPath.includes("cache")) {
			return true;
		}
		if (
			outdirPath &&
			(normalizedPath === outdirPath ||
				normalizedPath.startsWith(`${outdirPath}/`))
		) {
			return true;
		}
		return ignorePath ? ignorePath(normalizedPath) : false;
	};

	const nextFiles = new Set<string>();
	const nextDirectories = new Set<string>();

	for (const filePath of files) {
		const normalizedPath = nodeNormalizePath(filePath);
		if (isIgnoredPath(normalizedPath)) {
			continue;
		}
		nextFiles.add(normalizedPath);
		if (includeDirectories) {
			const directoryPath = dirname(normalizedPath);
			if (!isIgnoredPath(directoryPath)) {
				nextDirectories.add(directoryPath);
			}
		}
	}

	return {
		files: nextFiles,
		directories: nextDirectories,
		isIgnoredPath,
	};
}

export function createTrackedFs(options: TrackedFsOptions = {}): TrackedFs {
	const baseDir = options.baseDir ?? process.cwd();
	const baseFs = options.fs ?? fs;
	const readFiles = new Set<string>();

	const trackRead = (path: fs.PathLike | number) => {
		readFiles.add(nodeNormalizePath(resolve(baseDir, path.toString())));
	};

	const wrappedFs: typeof import("node:fs") = {
		...baseFs,
		// @ts-expect-error - Node's fs has too many overloads
		readFile: (
			path: fs.PathLike | number,
			options: { encoding?: null; flag?: string } | null | undefined,
			callback: (err: NodeJS.ErrnoException | null, data: Buffer) => void
		) => {
			trackRead(path);
			return baseFs.readFile(path, options, callback);
		},
		// @ts-expect-error - Node's fs has too many overloads
		readFileSync: (
			path: fs.PathLike | number,
			options?: { encoding?: null; flag?: string } | null | undefined
		) => {
			trackRead(path);
			return baseFs.readFileSync(path, options);
		},
		promises: {
			...baseFs.promises,
			// @ts-expect-error - Node's fs.promises has too many overloads
			readFile: async (
				path: fs.PathLike,
				options?: { encoding?: null; flag?: string } | null
			): Promise<Buffer> => {
				trackRead(path);
				return baseFs.promises.readFile(path, options);
			},
		},
	};

	return {
		fs: wrappedFs,
		readFiles,
		clearReadFiles: () => {
			readFiles.clear();
		},
	};
}
