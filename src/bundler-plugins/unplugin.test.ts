import { test, expect, beforeEach, afterEach, vi } from "vitest";
import consola from "consola";
import { memfs } from "memfs";
import {
	loadProjectInMemory,
	newProject,
	saveProjectToDirectory,
} from "@inlang/sdk";

let originalNodeEnv: string | undefined;

beforeEach(() => {
	originalNodeEnv = process.env.NODE_ENV;

	// Reset module state between tests so the module-scoped
	// `previousCompilation` doesn't leak across tests.
	vi.resetModules();

	// Mock logging methods to suppress error messages in tests
	consola.mockTypes(() => vi.fn());
});

afterEach(() => {
	if (originalNodeEnv !== undefined) {
		process.env.NODE_ENV = originalNodeEnv;
	} else {
		delete process.env.NODE_ENV;
	}
});

test("vite plugin does not throw when compilation is successful", async () => {
	// Dynamic import so beforeEach's vi.resetModules() yields a fresh module
	// (a static import would share module state across tests).
	const { paraglideVitePlugin } = await import("../bundler-plugins/vite.js");

	// Create and save a viable project to the virtual file system
	const project = await loadProjectInMemory({
		blob: await newProject({
			settings: {
				baseLocale: "en",
				locales: ["en", "de", "fr"],
			},
		}),
	});

	const fs = memfs().fs as unknown as typeof import("node:fs");

	await saveProjectToDirectory({
		project,
		path: "/project.inlang",
		fs: fs.promises,
	});

	const plugin = paraglideVitePlugin({
		project: "/project.inlang",
		outdir: "/test-output",
		fs: fs,
	}) as any;

	const mockContext = {
		addWatchFile: () => {},
	};

	await expect(plugin.buildStart?.call(mockContext)).resolves.toBeUndefined();
});

test("vite plugin does not throw on compilation errors in development", async () => {
	const { paraglideVitePlugin } = await import("../bundler-plugins/vite.js");

	process.env.NODE_ENV = "development";

	// Use memfs with no project (simulates missing project)
	const fs = memfs().fs as unknown as typeof import("node:fs");

	const plugin = paraglideVitePlugin({
		project: "/non-existent-project.inlang",
		outdir: "/test-output",
		fs: fs,
	}) as any;

	const mockContext = {
		addWatchFile: () => {},
	};

	// In development mode - should catch errors and NOT throw
	await expect(plugin.buildStart?.call(mockContext)).resolves.toBeUndefined();
});

test("vite plugin throws on compilation errors at build time", async () => {
	const { paraglideVitePlugin } = await import("../bundler-plugins/vite.js");

	process.env.NODE_ENV = "production";

	// Use memfs with no project (simulates missing project)
	const fs = memfs().fs as unknown as typeof import("node:fs");

	const plugin = paraglideVitePlugin({
		project: "/non-existent-project.inlang",
		outdir: "/test-output",
		fs: fs,
	}) as any;

	const mockContext = {
		addWatchFile: () => {},
	};

	// In production mode - should throw the error
	await expect(plugin.buildStart?.call(mockContext)).rejects.toThrow();
});

// Regression test for https://github.com/opral/inlang-paraglide-js/issues/659:
// the bundler plugins used to wipe `outdir` on every fresh process, racing
// concurrent reads (SSR/prerender modules, sibling Vite processes, the
// config-watcher reload) and producing ENOENT/MISSING_EXPORT/ERR_LOAD_URL.
test("vite plugin does not wipe outdir during first buildStart (#659)", async () => {
	const { paraglideVitePlugin: vitePlugin } =
		await import("../bundler-plugins/vite.js");

	const project = await loadProjectInMemory({
		blob: await newProject({
			settings: {
				baseLocale: "en",
				locales: ["en", "de", "fr"],
			},
		}),
	});

	const fs = memfs().fs as unknown as typeof import("node:fs");

	await saveProjectToDirectory({
		project,
		path: "/project.inlang",
		fs: fs.promises,
	});

	// Pre-seed outdir with a sentinel file mimicking a prior compilation
	// still on disk from an earlier process.
	await fs.promises.mkdir("/test-output", { recursive: true });
	await fs.promises.writeFile("/test-output/__sentinel__.txt", "kept");

	const rmSpy = vi.spyOn(fs.promises, "rm");

	const plugin = vitePlugin({
		project: "/project.inlang",
		outdir: "/test-output",
		cleanOutdir: true,
		fs: fs,
	}) as any;

	const mockContext = { addWatchFile: () => {} };
	await plugin.buildStart?.call(mockContext);

	// The plugin must not recursively remove the outdir during the first
	// compile, even though previousCompilation is undefined. Concurrent
	// readers may be holding file handles into outdir.
	for (const call of rmSpy.mock.calls) {
		expect(call[0]).not.toBe("/test-output");
	}
});

test("vite plugin warm-restart writes nothing when inputs unchanged (#659)", async () => {
	const project = await loadProjectInMemory({
		blob: await newProject({
			settings: {
				baseLocale: "en",
				locales: ["en", "de", "fr"],
			},
		}),
	});

	const fs = memfs().fs as unknown as typeof import("node:fs");

	await saveProjectToDirectory({
		project,
		path: "/project.inlang",
		fs: fs.promises,
	});

	const mockContext = { addWatchFile: () => {} };

	// First process: compile and persist files to outdir.
	{
		const { paraglideVitePlugin: vitePlugin } =
			await import("../bundler-plugins/vite.js");
		const plugin = vitePlugin({
			project: "/project.inlang",
			outdir: "/test-output",
			fs: fs,
		}) as any;
		await plugin.buildStart?.call(mockContext);
	}

	// Second process: simulate a fresh node process by resetting modules so
	// the module-scoped `previousCompilation` is undefined again. The plugin
	// should seed from on-disk hashes and write zero files (no race window).
	vi.resetModules();
	const { paraglideVitePlugin: vitePluginFresh } =
		await import("../bundler-plugins/vite.js");
	const plugin2 = vitePluginFresh({
		project: "/project.inlang",
		outdir: "/test-output",
		fs: fs,
	}) as any;

	const writeFileSpy = vi.spyOn(fs.promises, "writeFile");
	await plugin2.buildStart?.call(mockContext);

	expect(writeFileSpy).not.toHaveBeenCalled();
});

// Regression test for https://github.com/opral/paraglide-js/issues/693:
// `vite build` fires buildStart once per environment (client, ssr) and each
// run used to do a full compile() — project loading + message compilation —
// even though the inputs hadn't changed.
test("vite plugin skips compile() when buildStart fires again with unchanged inputs (#693)", async () => {
	const actualCompileModule = await vi.importActual<
		typeof import("../compiler/compile.js")
	>("../compiler/compile.js");
	const compileSpy = vi.fn(actualCompileModule.compile);
	vi.doMock("../compiler/compile.js", () => ({
		...actualCompileModule,
		compile: compileSpy,
	}));

	try {
		const { paraglideVitePlugin: vitePlugin } =
			await import("../bundler-plugins/vite.js");

		const project = await loadProjectInMemory({
			blob: await newProject({
				settings: {
					baseLocale: "en",
					locales: ["en", "de", "fr"],
				},
			}),
		});

		const fs = memfs().fs as unknown as typeof import("node:fs");

		await saveProjectToDirectory({
			project,
			path: "/project.inlang",
			fs: fs.promises,
		});

		const plugin = vitePlugin({
			project: "/project.inlang",
			outdir: "/test-output",
			fs: fs,
		}) as any;

		const mockContext = { addWatchFile: () => {} };

		// First environment (e.g. client) compiles.
		await plugin.buildStart?.call(mockContext);
		expect(compileSpy).toHaveBeenCalledTimes(1);

		// Second environment (e.g. ssr) — inputs unchanged, compile skipped.
		await plugin.buildStart?.call(mockContext);
		expect(compileSpy).toHaveBeenCalledTimes(1);

		// Changing an input file invalidates the digest and recompiles.
		const settingsPath = "/project.inlang/settings.json";
		const settings = JSON.parse(
			await fs.promises.readFile(settingsPath, "utf-8")
		);
		settings.locales = ["en", "de", "fr", "es"];
		await fs.promises.writeFile(settingsPath, JSON.stringify(settings));

		await plugin.buildStart?.call(mockContext);
		expect(compileSpy).toHaveBeenCalledTimes(2);
	} finally {
		vi.doUnmock("../compiler/compile.js");
	}
});

// A new file added next to tracked inputs must invalidate the digest via
// the directory-listing part of the hash, not only edits to known files.
test("vite plugin recompiles when a file is added to a tracked directory (#693)", async () => {
	const actualCompileModule = await vi.importActual<
		typeof import("../compiler/compile.js")
	>("../compiler/compile.js");
	const compileSpy = vi.fn(actualCompileModule.compile);
	vi.doMock("../compiler/compile.js", () => ({
		...actualCompileModule,
		compile: compileSpy,
	}));

	try {
		const { paraglideVitePlugin: vitePlugin } =
			await import("../bundler-plugins/vite.js");

		const project = await loadProjectInMemory({
			blob: await newProject({
				settings: { baseLocale: "en", locales: ["en", "de"] },
			}),
		});

		const fs = memfs().fs as unknown as typeof import("node:fs");

		await saveProjectToDirectory({
			project,
			path: "/project.inlang",
			fs: fs.promises,
		});

		const plugin = vitePlugin({
			project: "/project.inlang",
			outdir: "/test-output",
			fs: fs,
		}) as any;

		const mockContext = { addWatchFile: () => {} };

		await plugin.buildStart?.call(mockContext);
		await plugin.buildStart?.call(mockContext);
		expect(compileSpy).toHaveBeenCalledTimes(1);

		// No tracked file changed, but the listing of a tracked directory did.
		await fs.promises.writeFile("/project.inlang/added-later.txt", "new");

		await plugin.buildStart?.call(mockContext);
		expect(compileSpy).toHaveBeenCalledTimes(2);
	} finally {
		vi.doUnmock("../compiler/compile.js");
	}
});

// After a failed compile the stored digest must not be reused: restoring an
// input to its previous content has to trigger a real recompile, because the
// failed attempt may have left no (or partial) output.
test("vite plugin does not reuse a digest from before a failed compile (#693)", async () => {
	process.env.NODE_ENV = "development";

	const actualCompileModule = await vi.importActual<
		typeof import("../compiler/compile.js")
	>("../compiler/compile.js");
	const compileSpy = vi.fn(actualCompileModule.compile);
	vi.doMock("../compiler/compile.js", () => ({
		...actualCompileModule,
		compile: compileSpy,
	}));

	try {
		const { paraglideVitePlugin: vitePlugin } =
			await import("../bundler-plugins/vite.js");

		const project = await loadProjectInMemory({
			blob: await newProject({
				settings: { baseLocale: "en", locales: ["en", "de"] },
			}),
		});

		const fs = memfs().fs as unknown as typeof import("node:fs");

		await saveProjectToDirectory({
			project,
			path: "/project.inlang",
			fs: fs.promises,
		});

		const plugin = vitePlugin({
			project: "/project.inlang",
			outdir: "/test-output",
			fs: fs,
		}) as any;

		const mockContext = { addWatchFile: () => {} };

		await plugin.buildStart?.call(mockContext);
		expect(compileSpy).toHaveBeenCalledTimes(1);

		const settingsPath = "/project.inlang/settings.json";
		const originalSettings = await fs.promises.readFile(settingsPath, "utf-8");

		// Break the settings file — the compile attempt fails (dev mode
		// swallows the error) and must clear the stored digest.
		await fs.promises.writeFile(settingsPath, "{ not json");
		await plugin.buildStart?.call(mockContext);
		expect(compileSpy).toHaveBeenCalledTimes(2);

		// Restore the exact original content. The digest now matches the one
		// from before the failure — it must have been cleared, so this
		// buildStart has to compile again instead of skipping.
		await fs.promises.writeFile(settingsPath, originalSettings);
		await plugin.buildStart?.call(mockContext);
		expect(compileSpy).toHaveBeenCalledTimes(3);
	} finally {
		vi.doUnmock("../compiler/compile.js");
	}
});

// Two plugin instances with different filesystems must not share the tracked
// fs wrapper or cached compilation state — each compiles into its own fs.
test("vite plugin instances with different fs compile against their own fs (#693)", async () => {
	const { paraglideVitePlugin: vitePlugin } =
		await import("../bundler-plugins/vite.js");

	const makeProjectFs = async () => {
		const project = await loadProjectInMemory({
			blob: await newProject({
				settings: { baseLocale: "en", locales: ["en"] },
			}),
		});
		const fs = memfs().fs as unknown as typeof import("node:fs");
		await saveProjectToDirectory({
			project,
			path: "/project.inlang",
			fs: fs.promises,
		});
		return fs;
	};

	const fsA = await makeProjectFs();
	const fsB = await makeProjectFs();

	const mockContext = { addWatchFile: () => {} };

	const pluginA = vitePlugin({
		project: "/project.inlang",
		outdir: "/test-output",
		fs: fsA,
	}) as any;
	await pluginA.buildStart?.call(mockContext);

	const pluginB = vitePlugin({
		project: "/project.inlang",
		outdir: "/test-output",
		fs: fsB,
	}) as any;
	await pluginB.buildStart?.call(mockContext);

	// B's output must exist in B's filesystem — with a shared tracked fs it
	// would have been read from and written into A's filesystem instead.
	const outputB = await fsB.promises.readdir("/test-output");
	expect(outputB.length).toBeGreaterThan(0);
});
