import { test, expect, beforeEach, afterEach, vi } from "vitest";
import { paraglideVitePlugin } from "../bundler-plugins/vite.js";
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
