import {
	loadProjectInMemory,
	newProject,
	saveProjectToDirectory,
} from "@inlang/sdk";
import { memfs } from "memfs";
import { test, expect, vi } from "vitest";
import { compile } from "./compile.js";
import type { Runtime } from "./runtime/type.js";
import { defaultCompilerOptions } from "./compiler-options.js";
import consola from "consola";

test("loads a project and compiles it", async () => {
	const project = await loadProjectInMemory({
		blob: await newProject({
			settings: {
				baseLocale: "en",
				locales: ["en", "de", "fr"],
			},
		}),
	});

	const fs = memfs().fs as unknown as typeof import("node:fs");

	// save project to directory to test loading
	await saveProjectToDirectory({
		project,
		path: "/project.inlang",
		fs: fs.promises,
	});

	await compile({
		project: "/project.inlang",
		outdir: "/output",
		fs: fs,
	});

	const files = await fs.promises.readdir("/output");

	//runtime.js and messages.js are always compiled with the default options
	expect(files).toEqual(
		expect.arrayContaining(["runtime.js", "server.js", "messages.js"])
	);
});

test("cleans the output directory", async () => {
	const fs = memfs().fs as unknown as typeof import("node:fs");

	const project = await loadProjectInMemory({
		blob: await newProject({}),
	});

	// save project to directory to test loading
	await saveProjectToDirectory({
		project,
		path: "/project.inlang",
		fs: fs.promises,
	});

	await fs.promises.mkdir("/output/subdir", { recursive: true });
	await fs.promises.writeFile("/output/subdir/x.js", "console.log('hello')");
	await fs.promises.writeFile("/output/y.js", "console.log('hello')");

	await compile({
		project: "/project.inlang",
		outdir: "/output",
		fs: fs,
	});

	const outputDir = await fs.promises.readdir("/output");
	const outputSubDir = fs.existsSync("/output/subdir");

	expect(outputDir).not.toContain("y.js");
	expect(outputSubDir).toBe(false);
});

// Regression coverage for https://github.com/opral/paraglide-js/issues/581
test("runtime output strips sourcemap references", async () => {
	const fs = memfs().fs as unknown as typeof import("node:fs");

	const project = await loadProjectInMemory({
		blob: await newProject({
			settings: {
				baseLocale: "en",
				locales: ["en", "de"],
			},
		}),
	});

	await saveProjectToDirectory({
		project,
		path: "/project.inlang",
		fs: fs.promises,
	});

	await compile({
		project: "/project.inlang",
		outdir: "/output",
		fs: fs,
	});

	const runtimeFile = await fs.promises.readFile("/output/runtime.js", "utf8");
	const serverFile = await fs.promises.readFile("/output/server.js", "utf8");

	expect(runtimeFile).not.toMatch(/sourceMappingURL=/);
	expect(serverFile).not.toMatch(/sourceMappingURL=/);
});

test("experimental middleware locale splitting uses globalThis.__paraglide.ssr", async () => {
	const fs = memfs().fs as unknown as typeof import("node:fs");

	const project = await loadProjectInMemory({
		blob: await newProject({
			settings: {
				baseLocale: "en",
				locales: ["en", "de"],
			},
		}),
	});

	await saveProjectToDirectory({
		project,
		path: "/project.inlang",
		fs: fs.promises,
	});

	await compile({
		project: "/project.inlang",
		outdir: "/output",
		fs,
		experimentalMiddlewareLocaleSplitting: true,
	});

	const runtimeFile = await fs.promises.readFile("/output/runtime.js", "utf8");
	const serverFile = await fs.promises.readFile("/output/server.js", "utf8");

	expect(runtimeFile).toContain("(globalThis).__paraglide =");
	expect(runtimeFile).toContain("(globalThis).__paraglide.ssr =");
	expect(runtimeFile).not.toContain("__paraglide_ssr");
	expect(serverFile).toContain(
		"globalThis.__paraglide = globalThis.__paraglide ?? {};"
	);
	expect(serverFile).toContain("globalThis.__paraglide.ssr = ${escapedSsr}");
	expect(serverFile).toContain(String.raw`replace(/<\/(script)/gi, "<\\/$1")`);
	expect(serverFile).not.toContain("__paraglide_ssr");
});

test("doesn't clean the output directory if option is set to false", async () => {
	const fs = memfs().fs as unknown as typeof import("node:fs");

	const project = await loadProjectInMemory({
		blob: await newProject({}),
	});

	// save project to directory to test loading
	await saveProjectToDirectory({
		project,
		path: "/project.inlang",
		fs: fs.promises,
	});

	await fs.promises.mkdir("/output/subdir", { recursive: true });
	await fs.promises.writeFile("/output/subdir/x.js", "console.log('hello')");
	await fs.promises.writeFile("/output/y.js", "console.log('hello')");

	await compile({
		project: "/project.inlang",
		outdir: "/output",
		cleanOutdir: false,
		fs: fs,
	});

	const outputDir = await fs.promises.readdir("/output");
	const outputSubDir = fs.existsSync("/output/subdir");

	expect(outputDir).toContain("y.js");
	expect(outputSubDir).toBe(true);
});

test("multiple compile calls do not interfere with each other", async () => {
	const fs = memfs().fs as unknown as typeof import("node:fs");

	const project = await loadProjectInMemory({
		blob: await newProject({
			settings: {
				baseLocale: "en",
				locales: ["en", "de", "fr"],
			},
		}),
	});

	await saveProjectToDirectory({
		project,
		path: "/project.inlang",
		fs: fs.promises,
	});

	// different project settings to test compile output
	await project.settings.set({
		...(await project.settings.get()),
		baseLocale: "de",
		locales: ["de"],
	});

	await saveProjectToDirectory({
		project,
		path: "/project2.inlang",
		fs: fs.promises,
	});

	const compilations = [
		compile({
			project: "/project.inlang",
			outdir: "/output",
			fs: fs,
		}),
		compile({
			project: "/project2.inlang",
			outdir: "/output",
			fs: fs,
		}),
	];

	await Promise.all(compilations);

	const runtimeFile = await fs.promises.readFile("/output/runtime.js", "utf8");

	const runtime = (await import(
		"data:text/javascript;base64," +
			Buffer.from(
				// replace the
				runtimeFile.replace(
					`import "@inlang/paraglide-js/urlpattern-polyfill";`,
					""
				),
				"utf-8"
			).toString("base64")
	)) as Runtime;

	// expecting the second compile step to overwrite the first
	expect(runtime.baseLocale).toBe("de");
	expect(runtime.locales).toEqual(["de"]);
});

test("emits additional files", async () => {
	const additionalFiles = {
		"adapter/component.svelte": "<script>console.log('hello')</script>",
		"adapter.js": "console.log('hello')",
	};

	const project = await loadProjectInMemory({
		blob: await newProject({
			settings: {
				baseLocale: "en",
				locales: ["en", "de", "fr"],
			},
		}),
	});

	const fs = memfs().fs as unknown as typeof import("node:fs");

	// save project to directory to test loading
	await saveProjectToDirectory({
		project,
		path: "/project.inlang",
		fs: fs.promises,
	});

	await compile({
		project: "/project.inlang",
		outdir: "/output",
		fs: fs,
		additionalFiles,
	});

	const outputDir = await fs.promises.readdir("/output");
	const adapterDir = await fs.promises.readdir("/output/adapter");

	expect(outputDir).toEqual(
		expect.arrayContaining([
			"runtime.js",
			"server.js",
			"messages.js",
			"adapter.js",
		])
	);

	expect(adapterDir).toEqual(["component.svelte"]);
});

test("includes eslint-disable comment", async () => {
	const project = await loadProjectInMemory({
		blob: await newProject({
			settings: {
				baseLocale: "en",
				locales: ["en", "de", "fr"],
			},
		}),
	});

	const fs = memfs().fs as unknown as typeof import("node:fs");

	// save project to directory to test loading
	await saveProjectToDirectory({
		project,
		path: "/project.inlang",
		fs: fs.promises,
	});

	await compile({
		project: "/project.inlang",
		outdir: "/output",
		includeEslintDisableComment: true,
		fs: fs,
	});

	const messages = await fs.promises.readFile("/output/messages.js", "utf8");

	expect(messages).toContain("/* eslint-disable */");

	await compile({
		project: "/project.inlang",
		outdir: "/output",
		includeEslintDisableComment: false,
		fs: fs,
	});

	const messagesWithoutComment = await fs.promises.readFile(
		"/output/messages.js",
		"utf8"
	);

	expect(messagesWithoutComment).not.toContain("/* eslint-disable */");
});

test("default compiler options should include cookied, variable and baseLocale to ensure easy try out of paraglide js, working both in server and browser environemnts", () => {
	// someone trying out paraglide js should be able to call `getLocale()` and `setLocale()`
	// without getting an error slammed in their face saying "define your strategy".
	//
	// instead, make the apis work out of the box and once the developer is convinced that
	// paraglide js is the right tool for them, they can then define their own strategy.

	expect(defaultCompilerOptions.strategy).toEqual([
		"cookie",
		"globalVariable",
		"baseLocale",
	]);
});

test("emits warnings for modules that couldn't be imported locally", async () => {
	const project = await loadProjectInMemory({
		blob: await newProject({
			settings: {
				baseLocale: "en",
				locales: ["en", "de", "fr"],
				modules: ["./non-existent-paraglide-plugin.js"],
			},
		}),
	});

	const mock = vi.fn();

	consola.mockTypes(() => mock);

	const fs = memfs().fs as unknown as typeof import("node:fs");

	// save project to directory to test loading
	await saveProjectToDirectory({
		project,
		path: "/project.inlang",
		fs: fs.promises,
	});

	await compile({
		project: "/project.inlang",
		outdir: "/output",
		fs: fs,
	});

	expect(mock).toHaveBeenCalled();
});

test("emits warnings for modules that couldn't be imported via http", async () => {
	const project = await loadProjectInMemory({
		blob: await newProject({
			settings: {
				baseLocale: "en",
				locales: ["en", "de", "fr"],
				modules: ["https://example.com/non-existent-paraglide-plugin.js"],
			},
		}),
	});

	const mock = vi.fn();

	consola.mockTypes(() => mock);

	const fs = memfs().fs as unknown as typeof import("node:fs");
	const fetchMock = vi.fn().mockRejectedValue(new TypeError("network error"));
	vi.stubGlobal("fetch", fetchMock);

	const errorsSpy = vi.spyOn(project.errors, "get").mockResolvedValue([
		{
			message:
				"Failed to import module https://example.com/non-existent-paraglide-plugin.js",
		} as any,
	]);

	// save project to directory to test loading
	await saveProjectToDirectory({
		project,
		path: "/project.inlang",
		fs: fs.promises,
	});

	try {
		await compile({
			project: "/project.inlang",
			outdir: "/output",
			fs: fs,
		});
	} finally {
		vi.unstubAllGlobals();
		errorsSpy.mockRestore();
	}

	expect(mock).toHaveBeenCalled();
});

test.each([
	["message-modules", false],
	["locale-modules", false],
	["message-modules", true],
	["locale-modules", true],
] as const)(
	"writes complete %s output (declarations: %s) with limited filesystem capacity",
	async (outputStructure, emitTsDeclarations) => {
		const { hashDirectory } =
			await import("../services/file-handling/write-output.js");
		const fs = memfs().fs as unknown as typeof import("node:fs");
		const diskFs = await import("node:fs/promises");
		await fs.promises.mkdir("/project.inlang", { recursive: true });
		await fs.promises.mkdir("/messages", { recursive: true });
		await fs.promises.writeFile(
			"/plugin.js",
			await diskFs.readFile(
				new URL(
					"../../node_modules/@inlang/plugin-message-format/dist/index.js",
					import.meta.url
				)
			)
		);
		await fs.promises.writeFile(
			"/project.inlang/settings.json",
			JSON.stringify({
				baseLocale: "en",
				locales: ["en", "de"],
				modules: ["/plugin.js"],
				"plugin.inlang.messageFormat": {
					pathPattern: "/messages/{locale}.json",
				},
			})
		);
		for (const locale of ["en", "de"]) {
			await fs.promises.writeFile(
				`/messages/${locale}.json`,
				JSON.stringify(
					Object.fromEntries(
						Array.from({ length: 40 }, (_, i) => [
							`message_${i}`,
							`message ${i} in ${locale}`,
						])
					)
				)
			);
		}
		const original = fs.promises.writeFile.bind(fs.promises);
		let active = 0;
		let peak = 0;
		const spy = vi.spyOn(fs.promises, "writeFile").mockImplementation((async (
			...args
		) => {
			if (!String(args[0]).startsWith("/output/")) return original(...args);
			active++;
			peak = Math.max(peak, active);
			try {
				if (active > 32)
					throw Object.assign(new Error("too many open files"), {
						code: "EMFILE",
					});
				await new Promise<void>((resolve) => setImmediate(resolve));
				return await original(...args);
			} finally {
				active--;
			}
		}) as typeof fs.promises.writeFile);
		try {
			const result = await compile({
				project: "/project.inlang",
				outdir: "/output",
				fs,
				outputStructure,
				emitTsDeclarations,
				additionalFiles: {
					"nested/additional.js": "export const extra = true;",
				},
			});
			expect(await hashDirectory("/output", fs.promises)).toEqual(
				result.outputHashes
			);
			expect(
				await fs.promises.readFile("/output/nested/additional.js", "utf8")
			).toContain("extra");
			expect(Object.keys(result.outputHashes!)).toContain(
				outputStructure === "message-modules"
					? "messages/message_39.js"
					: "messages/de.js"
			);
			expect(
				Object.keys(result.outputHashes!).some((p) => p.endsWith(".d.ts"))
			).toBe(emitTsDeclarations);
			expect(peak).toBeLessThanOrEqual(32);
			expect(active).toBe(0);
		} finally {
			spy.mockRestore();
		}
	}
);
