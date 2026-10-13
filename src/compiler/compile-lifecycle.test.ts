import {
	loadProjectInMemory,
	newProject,
	saveProjectToDirectory,
} from "@inlang/sdk";
import { memfs } from "memfs";
import { test, expect, vi } from "vitest";
import { compile } from "./compile.js";

vi.mock("@inlang/sdk", async (importOriginal) => {
	const sdk = await importOriginal<typeof import("@inlang/sdk")>();
	return {
		...sdk,
		loadProjectFromDirectory: vi.fn(sdk.loadProjectFromDirectory),
	};
});

test.each([false, true])(
	"closes the loaded project after write failure and permits a retry (cleanup fails: %s)",
	async (cleanupFails) => {
		const sdk = await import("@inlang/sdk");
		const fs = memfs().fs as unknown as typeof import("node:fs");
		const project = await loadProjectInMemory({ blob: await newProject({}) });
		try {
			await saveProjectToDirectory({
				project,
				path: "/project.inlang",
				fs: fs.promises,
			});
		} finally {
			await project.close();
		}
		const load = sdk.loadProjectFromDirectory;
		const closed = vi.fn();
		const loadSpy = vi
			.spyOn(sdk, "loadProjectFromDirectory")
			.mockImplementation(async (args) => {
				const loaded = await load(args);
				const close = loaded.close.bind(loaded);
				loaded.close = async () => {
					closed();
					await close();
					if (cleanupFails && closed.mock.calls.length === 1)
						throw new Error("close failed");
				};
				return loaded;
			});
		const originalWrite = fs.promises.writeFile.bind(fs.promises);
		const error = Object.assign(new Error("write: no space left on device"), {
			code: "ENOSPC",
		});
		const writeSpy = vi
			.spyOn(fs.promises, "writeFile")
			.mockImplementation((async (...args) => {
				if (String(args[0]).startsWith("/output/")) throw error;
				return originalWrite(...args);
			}) as typeof fs.promises.writeFile);
		try {
			await expect(
				compile({ project: "/project.inlang", outdir: "/output", fs })
			).rejects.toBe(error);
			expect(closed).toHaveBeenCalledTimes(1);
			writeSpy.mockRestore();
			const result = await compile({
				project: "/project.inlang",
				outdir: "/output",
				fs,
			});
			expect(result.outputHashes).toHaveProperty("runtime.js");
			expect(closed).toHaveBeenCalledTimes(2);
		} finally {
			loadSpy.mockRestore();
			writeSpy.mockRestore();
		}
	}
);
