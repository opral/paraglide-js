import { afterEach, beforeEach, expect, test, vi } from "vitest";
import consola from "consola";
import fs from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import {
	loadProjectInMemory,
	newProject,
	saveProjectToDirectory,
} from "@inlang/sdk";

let originalNodeEnv: string | undefined;
const directories: string[] = [];
const hookContext = { addWatchFile: () => {} };

beforeEach(() => {
	originalNodeEnv = process.env.NODE_ENV;
	vi.resetModules();
	consola.mockTypes(() => vi.fn());
});

afterEach(async () => {
	if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
	else process.env.NODE_ENV = originalNodeEnv;
	vi.doUnmock("../compiler/compile.js");
	vi.restoreAllMocks();
	await Promise.all(
		directories
			.splice(0)
			.map((directory) => fs.rm(directory, { recursive: true, force: true }))
	);
});

async function fixture(configExpression?: string) {
	const workspace = await fs.realpath(
		await fs.mkdtemp(path.join(tmpdir(), "paraglide-runtime-mode-"))
	);
	directories.push(workspace);
	const projectDir = path.join(workspace, "project.inlang");
	const outdir = path.join(workspace, "output");
	const project = await loadProjectInMemory({
		blob: await newProject({
			settings: { baseLocale: "en", locales: ["en", "de"] },
		}),
	});
	try {
		await saveProjectToDirectory({ project, path: projectDir, fs });
	} finally {
		await project.close();
	}
	if (configExpression !== undefined) {
		await fs.writeFile(
			path.join(projectDir, "paraglide.config.js"),
			`export default { isDevelopment: ${JSON.stringify(configExpression)} };`
		);
	}
	return { workspace, projectDir, outdir };
}

function configureVite(plugin: any, root: string, isProduction: boolean) {
	const hook = plugin.configResolved ?? plugin.vite?.configResolved;
	if (typeof hook === "function") hook({ root, isProduction });
	else hook.handler({ root, isProduction });
}

async function expectRuntimeMode(outdir: string, expression: string) {
	const runtime = await fs.readFile(path.join(outdir, "runtime.js"), "utf8");
	expect(runtime.match(/^export const isDevelopment = (.+);$/m)?.[1]).toBe(
		expression
	);
}

test.each(
	(["message-modules", "locale-modules"] as const).flatMap((outputStructure) =>
		[false, true].map((isProduction) => ({ outputStructure, isProduction }))
	)
)(
	"Vite production=$isProduction determines runtime diagnostics with fixed $outputStructure output",
	async ({ outputStructure, isProduction }) => {
		// Vite's resolved build mode is authoritative, even when another tool
		// has set NODE_ENV to the opposite value before creating the plugin.
		process.env.NODE_ENV = isProduction ? "development" : "production";
		const { workspace, projectDir, outdir } = await fixture();
		const { paraglideVitePlugin } = await import("./vite.js");
		const plugin = paraglideVitePlugin({
			project: projectDir,
			outdir,
			outputStructure,
		}) as any;
		configureVite(plugin, workspace, isProduction);
		await plugin.buildStart.call(hookContext);
		await expectRuntimeMode(outdir, String(!isProduction));
	}
);

test.each([
	{ isProduction: true, config: "true", plugin: undefined, expected: "true" },
	{
		isProduction: false,
		config: "false",
		plugin: undefined,
		expected: "false",
	},
	{
		isProduction: true,
		config: "false",
		plugin: "globalThis.__PARAGLIDE_DIAGNOSTICS__ === true",
		expected: "globalThis.__PARAGLIDE_DIAGNOSTICS__ === true",
	},
])(
	"explicit runtime diagnostic expression overrides Vite production=$isProduction ($expected)",
	async ({ isProduction, config, plugin: expression, expected }) => {
		const { workspace, projectDir, outdir } = await fixture(config);
		const { paraglideVitePlugin } = await import("./vite.js");
		const plugin = paraglideVitePlugin({
			project: projectDir,
			outdir,
			isDevelopment: expression,
			outputStructure: "message-modules",
		}) as any;
		configureVite(plugin, workspace, isProduction);
		await plugin.buildStart.call(hookContext);
		await expectRuntimeMode(outdir, expected);
	}
);

test.each(["warm", "cold"])(
	"switching Vite mode invalidates the %s compilation cache without changing output structure",
	async (cache) => {
		const { workspace, projectDir, outdir } = await fixture();
		const actual = await vi.importActual<
			typeof import("../compiler/compile.js")
		>("../compiler/compile.js");
		const compile = vi.fn(actual.compile);
		vi.doMock("../compiler/compile.js", () => ({ ...actual, compile }));
		async function build(isProduction: boolean) {
			if (cache === "cold") vi.resetModules();
			const { paraglideVitePlugin } = await import("./vite.js");
			const plugin = paraglideVitePlugin({
				project: projectDir,
				outdir,
				outputStructure: "message-modules",
			}) as any;
			configureVite(plugin, workspace, isProduction);
			await plugin.buildStart.call(hookContext);
			await expectRuntimeMode(outdir, String(!isProduction));
		}
		await build(false);
		expect(compile).toHaveBeenCalledTimes(1);
		await build(false);
		expect(compile).toHaveBeenCalledTimes(1);
		await build(true);
		expect(compile).toHaveBeenCalledTimes(2);
		await build(true);
		expect(compile).toHaveBeenCalledTimes(2);
		await build(false);
		expect(compile).toHaveBeenCalledTimes(3);
	}
);

test.each([
	{ nodeEnv: "production", expected: "false" },
	{ nodeEnv: "development", expected: "true" },
	{ nodeEnv: undefined, expected: "true" },
])(
	"non-Vite runtime diagnostics default from NODE_ENV=$nodeEnv",
	async ({ nodeEnv, expected }) => {
		if (nodeEnv === undefined) delete process.env.NODE_ENV;
		else process.env.NODE_ENV = nodeEnv;
		const { projectDir, outdir } = await fixture();
		const { paraglideRollupPlugin } = await import("./rollup.js");
		const plugin = paraglideRollupPlugin({
			project: projectDir,
			outdir,
			outputStructure: "message-modules",
		}) as any;
		await plugin.buildStart.call(hookContext);
		await expectRuntimeMode(outdir, expected);
	}
);
