import { expect, test } from "vitest";
import { memfs } from "memfs";
import {
	loadProjectInMemory,
	newProject,
	saveProjectToDirectory,
} from "@inlang/sdk";
import { paraglideVitePlugin } from "./vite.js";
import { perLocaleBuildStaticLocaleExpression } from "../compiler/per-locale-build.js";

test("experimentalPerLocaleBuild configures the compiler and emits the detected framework adapter", async () => {
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

	const plugins = paraglideVitePlugin({
		project: "/project.inlang",
		outdir: "/src/paraglide",
		fs,
		experimentalPerLocaleBuild: true,
		additionalFiles: { "custom.js": "export const custom = true;\n" },
	});
	expect(Array.isArray(plugins)).toBe(true);
	if (!Array.isArray(plugins))
		throw new Error("Expected multiple Vite plugins");
	expect(plugins.map((plugin) => plugin.name)).toEqual([
		"unplugin-paraglide-js",
		"paraglide-per-locale-build",
	]);

	const compiler = plugins[0]!;
	const perLocaleBuild = plugins[1]!;
	if (typeof perLocaleBuild.configResolved !== "function") {
		throw new Error("Expected the per-locale configResolved hook");
	}
	perLocaleBuild.configResolved.call(
		{} as never,
		{
			root: "/",
			plugins: [{ name: "tanstack-start-core:config" }],
			define: {},
			build: { ssr: false },
		} as never
	);
	if (typeof compiler.buildStart !== "function") {
		throw new Error("Expected the compiler buildStart hook");
	}
	await compiler.buildStart.call({ addWatchFile() {} } as never, {} as never);

	expect(
		await fs.promises.readFile(
			"/src/paraglide/tanstack-start.server.js",
			"utf8"
		)
	).toContain("createStartHandler");
	expect(
		await fs.promises.readFile("/src/paraglide/custom.js", "utf8")
	).toContain("export const custom = true;");
	expect(
		await fs.promises.readFile("/src/paraglide/runtime.js", "utf8")
	).toContain(perLocaleBuildStaticLocaleExpression);
});

test("experimentalPerLocaleBuild rejects conflicting compiler options", () => {
	const common = { project: "/project.inlang", outdir: "/src/paraglide" };
	expect(() =>
		paraglideVitePlugin({
			...common,
			experimentalPerLocaleBuild: true,
			experimentalStaticLocale: '"de"',
		})
	).toThrow("cannot be combined with experimentalStaticLocale");
	expect(() =>
		paraglideVitePlugin({
			...common,
			experimentalPerLocaleBuild: true,
			experimentalMiddlewareLocaleSplitting: true,
		})
	).toThrow("cannot be combined with experimentalMiddlewareLocaleSplitting");
	expect(() =>
		paraglideVitePlugin({
			...common,
			experimentalPerLocaleBuild: true,
			outputStructure: "locale-modules",
		})
	).toThrow('requires outputStructure: "message-modules"');
	expect(() =>
		paraglideVitePlugin({
			...common,
			experimentalPerLocaleBuild: true,
			strategy: ["preferredLanguage", "baseLocale"],
		})
	).toThrow('first locale strategy to be "url" or "cookie"');
	expect(() =>
		paraglideVitePlugin({
			...common,
			experimentalPerLocaleBuild: true,
			routeStrategies: [],
		})
	).toThrow("does not support routeStrategies");
	const plugins = paraglideVitePlugin({
		...common,
		experimentalPerLocaleBuild: true,
		additionalFiles: { "tanstack-start.server.js": "user content" },
	});
	if (!Array.isArray(plugins)) {
		throw new Error("Expected multiple Vite plugins");
	}
	const configResolved = plugins[1]?.configResolved;
	if (typeof configResolved !== "function") {
		throw new Error("Expected the per-locale configResolved hook");
	}
	expect(() =>
		configResolved.call(
			{} as never,
			{
				root: "/",
				plugins: [{ name: "tanstack-start-core:config" }],
				define: {},
				build: { ssr: false },
			} as never
		)
	).toThrow("additionalFiles already defines that path");
});
