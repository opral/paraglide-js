import { test, expect, vi } from "vitest";
import path from "node:path";

test.each([
	{
		platform: "win32",
		paths: path.win32,
		directory: "\\\\server\\share",
		sibling: "\\\\server\\share-other\\file.json",
	},
	{
		platform: "win32",
		paths: path.win32,
		directory: "C:\\",
		sibling: "D:\\file.json",
	},
	{ platform: "linux", paths: path.posix, directory: "/", sibling: undefined },
	{
		platform: "linux",
		paths: path.posix,
		directory: "/project/",
		sibling: "/project-other/file.json",
	},
])(
	"matches descendants and excludes output under $directory",
	async ({ platform, paths, directory, sibling }) => {
		vi.resetModules();
		vi.stubGlobal("process", { ...process, platform });
		vi.doMock("node:path", () => ({ ...paths, default: paths }));
		try {
			const { isPathWithinDirectories, getWatchTargets } =
				await import("./tracked-fs.js");
			const file = paths.join(directory, "paraglide.config.js");
			expect(isPathWithinDirectories(directory, [directory])).toBe(true);
			expect(isPathWithinDirectories(file, [directory])).toBe(true);
			expect(
				isPathWithinDirectories(paths.join(directory, "nested", "file.json"), [
					directory,
				])
			).toBe(true);
			const targets = getWatchTargets([file], { outdir: directory });
			expect(targets.isIgnoredPath(file)).toBe(true);
			expect(targets.files.size).toBe(0);
			if (sibling) {
				expect(isPathWithinDirectories(sibling, [directory])).toBe(false);
				expect(targets.isIgnoredPath(sibling)).toBe(false);
			}
		} finally {
			vi.doUnmock("node:path");
			vi.unstubAllGlobals();
			vi.resetModules();
		}
	}
);
