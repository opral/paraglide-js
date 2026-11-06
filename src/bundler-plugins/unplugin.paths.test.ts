import { test, expect, vi } from "vitest";
import path from "node:path";
import fs from "node:fs";
import type { UnpluginBuildContext } from "unplugin";

test.each([
	{
		platform: "win32",
		paths: path.win32,
		project: "\\\\server\\share",
		outdir: "C:/output",
	},
	{
		platform: "win32",
		paths: path.win32,
		project: "C:\\",
		outdir: "D:/output",
	},
	{ platform: "linux", paths: path.posix, project: "/", outdir: "/output" },
])(
	"reloads config at the root of $project",
	async ({ platform, paths, project, outdir }) => {
		vi.resetModules();
		vi.stubGlobal("process", { ...process, platform });
		vi.doMock("node:path", () => ({ ...paths, default: paths }));
		let cookieName = "cold";
		const compile = vi.fn(async () => ({ outputHashes: undefined }));
		const loadConfig = vi.fn(async () => ({
			path: paths.join(project, "paraglide.config.js"),
			config: { outdir, cookieName },
		}));
		const clearCache = vi.fn();
		vi.doMock("../compiler/compile.js", () => ({ compile }));
		vi.doMock("../compiler/seed-previous-compilation.js", () => ({
			seedPreviousCompilationFromOutdir: async () => undefined,
		}));
		vi.doMock("../services/config/index.js", async (importOriginal) => ({
			...(await importOriginal<typeof import("../services/config/index.js")>()),
			resolveConfigCandidate: async () =>
				paths.join(project, "paraglide.config.js"),
			loadParaglideConfig: loadConfig,
			clearParaglideConfigCache: clearCache,
		}));
		try {
			const { unpluginFactory } = await import("./unplugin.js");
			const { nodeNormalizePath } =
				await import("../utilities/node-normalize-path.js");
			// Isolate config-event routing from remote filesystem I/O and compilation.
			const fakeFs = {
				...fs,
				promises: {
					...fs.promises,
					mkdir: async () => undefined,
					readFile: async () => {
						throw Object.assign(new Error("missing cache"), { code: "ENOENT" });
					},
				},
			} as typeof fs;
			const plugin = unpluginFactory({ project, fs: fakeFs });
			if (Array.isArray(plugin))
				throw new Error("Expected one compiler plugin");
			const context: UnpluginBuildContext = {
				addWatchFile: vi.fn(),
				emitFile: vi.fn(),
				getWatchFiles: () => [],
				parse: vi.fn(),
			};
			await plugin.buildStart?.call(context);
			expect(compile).toHaveBeenLastCalledWith(
				expect.objectContaining({ cookieName: "cold" })
			);
			cookieName = "hot";
			await plugin.watchChange?.call(
				context,
				paths.join(project, "paraglide.config.js"),
				{ event: "update" }
			);
			expect(clearCache).toHaveBeenCalledWith({
				projectDir: nodeNormalizePath(paths.resolve(project)),
			});
			expect(loadConfig).toHaveBeenCalledTimes(2);
			expect(compile).toHaveBeenLastCalledWith(
				expect.objectContaining({ cookieName: "hot" })
			);
		} finally {
			vi.doUnmock("node:path");
			vi.doUnmock("../compiler/compile.js");
			vi.doUnmock("../compiler/seed-previous-compilation.js");
			vi.doUnmock("../services/config/index.js");
			vi.unstubAllGlobals();
			vi.resetModules();
		}
	}
);
