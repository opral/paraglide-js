import memfs from "memfs";
import path from "node:path";
import type fs from "node:fs";
import { expect, test } from "vitest";
import {
	createTrackedFs,
	getWatchTargets,
	isPathWithinDirectories,
} from "./tracked-fs.js";
import { nodeNormalizePath } from "../../utilities/node-normalize-path.js";

test("tracks readFile and promises.readFile calls", async () => {
	const baseDir = "/";
	const memFs = memfs.createFsFromVolume(
		memfs.Volume.fromJSON({
			"/messages.json": "test",
		})
	) as unknown as typeof fs;
	const tracked = createTrackedFs({ baseDir, fs: memFs });

	await new Promise<void>((resolvePromise, rejectPromise) => {
		tracked.fs.readFile("/messages.json", null, (error, data) => {
			if (error) {
				rejectPromise(error);
				return;
			}
			expect(data.toString()).toBe("test");
			resolvePromise();
		});
	});

	await tracked.fs.promises.readFile("/messages.json");

	const normalizedPath = nodeNormalizePath(
		path.resolve(baseDir, "messages.json")
	);
	expect(tracked.readFiles.has(normalizedPath)).toBe(true);
});

test("tracks readFileSync and clears tracked files", async () => {
	const baseDir = "/";
	const memFs = memfs.createFsFromVolume(
		memfs.Volume.fromJSON({
			"/sync.json": "sync",
		})
	) as unknown as typeof fs;
	const tracked = createTrackedFs({ baseDir, fs: memFs });

	const contents = tracked.fs.readFileSync("/sync.json");
	expect(contents.toString()).toBe("sync");

	expect(tracked.readFiles.size).toBe(1);
	tracked.clearReadFiles();
	expect(tracked.readFiles.size).toBe(0);
});

test("getWatchTargets filters cache files and collects directories", () => {
	const files = new Set<string>([
		"/project/messages/en.json",
		"/project/cache/tmp.json",
	]);
	const targets = getWatchTargets(files);

	expect(targets.files).toEqual(
		new Set([nodeNormalizePath("/project/messages/en.json")])
	);
	expect(targets.directories).toEqual(
		new Set([nodeNormalizePath("/project/messages")])
	);
});

test("getWatchTargets ignores outdir and descendants", () => {
	const files = new Set<string>([
		"/project/src/paraglide/index.js",
		"/project/messages/en.json",
	]);
	const targets = getWatchTargets(files, {
		baseDir: "/project",
		outdir: "src/paraglide",
	});

	expect(
		targets.files.has(nodeNormalizePath("/project/src/paraglide/index.js"))
	).toBe(false);
	expect(
		targets.files.has(nodeNormalizePath("/project/messages/en.json"))
	).toBe(true);
	expect(targets.isIgnoredPath("/project/src/paraglide/new.js")).toBe(true);
	expect(targets.directories).toEqual(
		new Set([nodeNormalizePath("/project/messages")])
	);
});

test("getWatchTargets can keep cache files when ignoreCache is false", () => {
	const files = new Set<string>(["/project/cache/keep.json"]);
	const targets = getWatchTargets(files, { ignoreCache: false });

	expect(targets.files.has(nodeNormalizePath("/project/cache/keep.json"))).toBe(
		true
	);
});

test("getWatchTargets respects ignorePath predicate", () => {
	const files = new Set<string>([
		"/project/messages/en.json",
		"/project/extra.txt",
	]);
	const targets = getWatchTargets(files, {
		ignorePath: (path) => path.endsWith("extra.txt"),
	});

	expect(targets.files.has(nodeNormalizePath("/project/extra.txt"))).toBe(
		false
	);
	expect(targets.directories).toEqual(
		new Set([nodeNormalizePath("/project/messages")])
	);
});

test("getWatchTargets can omit directories", () => {
	const files = new Set<string>(["/project/messages/en.json"]);
	const targets = getWatchTargets(files, { includeDirectories: false });

	expect(targets.directories.size).toBe(0);
});

test("isPathWithinDirectories matches nested paths", () => {
	const directories = new Set<string>(["/project/messages", "/project/other"]);

	expect(
		isPathWithinDirectories("/project/messages/nested/file.json", directories)
	).toBe(true);
	expect(
		isPathWithinDirectories("/project/unknown/file.json", directories)
	).toBe(false);
});
