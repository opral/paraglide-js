import {
	loadProjectInMemory,
	newProject,
	saveProjectToDirectory,
} from "@inlang/sdk";
import { memfs } from "memfs";
import { expect, test } from "vitest";
import { perLocaleBuildStaticLocaleExpression } from "../compiler/per-locale-build.js";
import { paraglideVitePlugin } from "./vite.js";

test("experimentalPerLocaleBuild generates locale source modules and installs the Vite environment orchestrator", async () => {
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
		strategy: ["preferredLanguage", "baseLocale"],
		additionalFiles: { "custom.js": "export const custom = true;\n" },
	});
	if (!Array.isArray(plugins)) {
		throw new Error("Expected multiple Vite plugins");
	}
	expect(plugins.map((plugin) => plugin.name)).toEqual([
		"paraglide-config-discovery-root",
		"unplugin-paraglide-js",
		"paraglide-vite-locale-environments",
	]);

	const compiler = plugins[1]!;
	if (typeof compiler.buildStart !== "function") {
		throw new Error("Expected the compiler buildStart hook");
	}
	await compiler.buildStart.call({ addWatchFile() {} } as never, {} as never);

	expect(
		await fs.promises.readFile("/src/paraglide/messages/en.js", "utf8")
	).toBeDefined();
	expect(
		await fs.promises.readFile("/src/paraglide/messages/de.js", "utf8")
	).toBeDefined();
	expect(
		await fs.promises.readFile("/src/paraglide/runtime.js", "utf8")
	).toContain(perLocaleBuildStaticLocaleExpression);
	expect(
		await fs.promises.readFile("/src/paraglide/custom.js", "utf8")
	).toContain("export const custom = true;");
	await expect(
		fs.promises.readFile("/src/paraglide/tanstack-start.server.js", "utf8")
	).rejects.toThrow();
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
			outputStructure: "message-modules",
		})
	).toThrow('requires outputStructure: "locale-modules"');
	expect(() =>
		paraglideVitePlugin({
			...common,
			experimentalPerLocaleBuild: true,
			routeStrategies: [
				{
					match: "/api/:path(.*)?",
					exclude: true,
				},
			],
		})
	).not.toThrow();
});
