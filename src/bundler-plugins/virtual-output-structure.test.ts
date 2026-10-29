import { expect, test } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { createServer } from "vite";
import { paraglideVitePlugin } from "./vite.js";
import { compile } from "../compiler/compile.js";
import { compileCatalog, compileProject } from "../compiler/compile-project.js";
import { unpluginFactory } from "./unplugin.js";
import type { CompilerOptions } from "../compiler/compiler-options.js";

type Layout = NonNullable<CompilerOptions["outputStructure"]>;

test.each([
	undefined,
	"message-modules",
	"locale-modules",
	"virtual-modules",
] as const)(
	"Vite layout config can change without restarting, with plugin override %s",
	async (override) => {
		const root = await fs.realpath(
			await fs.mkdtemp(path.join(tmpdir(), "paraglide-layout-"))
		);
		const originalEnv = process.env.NODE_ENV;
		let server: Awaited<ReturnType<typeof createServer>> | undefined;
		try {
			process.env.NODE_ENV = "development";
			const project = path.join(root, "project.inlang");
			const outdir = path.join(root, "out");
			const config = path.join(project, "paraglide.config.js");
			await fs.mkdir(project);
			await fs.writeFile(path.join(root, "package.json"), '{"type":"module"}');
			await fs.writeFile(
				path.join(project, "settings.json"),
				JSON.stringify({
					baseLocale: "en",
					locales: ["en"],
					modules: ["./plugin.js"],
				})
			);
			await fs.writeFile(path.join(root, "messages.json"), "{}");
			await fs.writeFile(
				path.join(root, "plugin.js"),
				`export default {key:"plugin.fixture.layout",toBeImportedFiles:async()=>[{path:"./messages.json",locale:"en"}],importFiles:()=>({bundles:[{id:"greeting"}],messages:[{bundleId:"greeting",locale:"en"}],variants:[{messageBundleId:"greeting",messageLocale:"en",pattern:[{type:"text",value:"HELLO_LAYOUT"}]}]})};`
			);
			await fs.writeFile(config, "export default {};");
			await fs.writeFile(
				path.join(root, "entry.js"),
				'import {m} from "./out/messages.js";export const value=m.greeting();'
			);
			server = await createServer({
				root,
				configFile: false,
				logLevel: "silent",
				plugins: [
					paraglideVitePlugin({
						project,
						outdir,
						outputStructure: override,
						strategy: ["baseLocale"],
						emitGitIgnore: false,
						emitReadme: false,
						emitPrettierIgnore: false,
					}),
				],
				optimizeDeps: { noDiscovery: true },
				server: { port: 0, watch: null },
			});
			await server.listen();
			await server.pluginContainer.buildStart({});
			const assertLayout = async (configured?: Layout) => {
				const expected = override ?? configured ?? "virtual-modules";
				expect((await server!.ssrLoadModule("/entry.js")).value).toBe(
					"HELLO_LAYOUT"
				);
				const facade = await fs.readFile(
					path.join(outdir, "messages.js"),
					"utf8"
				);
				if (expected === "virtual-modules") {
					expect(facade).toContain("virtual:paraglide/");
					expect(await fs.readdir(outdir)).toHaveLength(9);
					await expect(
						fs.access(path.join(outdir, "messages"))
					).rejects.toThrow();
				} else {
					expect(facade).not.toContain("virtual:paraglide/");
					await fs.access(
						path.join(
							outdir,
							"messages",
							expected === "message-modules" ? "greeting.js" : "en.js"
						)
					);
					// Physical layouts retain the compiler's false declaration default.
					await expect(
						fs.access(path.join(outdir, "messages.d.ts"))
					).rejects.toThrow();
					await expect(
						fs.access(path.join(outdir, "messages.virtual.d.ts"))
					).rejects.toThrow();
				}
			};
			await assertLayout();
			for (const layout of [
				"message-modules",
				"locale-modules",
				"virtual-modules",
				undefined,
			] as const) {
				await fs.writeFile(
					config,
					`export default ${JSON.stringify(layout ? { outputStructure: layout } : {})};`
				);
				await server.pluginContainer.watchChange(config, { event: "update" });
				await assertLayout(layout);
			}
		} finally {
			await server?.close();
			if (originalEnv === undefined) delete process.env.NODE_ENV;
			else process.env.NODE_ENV = originalEnv;
			await fs.rm(root, { recursive: true, force: true });
		}
	}
);

test("virtual output is rejected outside the Vite integration before loading the project", async () => {
	const options = {
		project: "/missing/project.inlang",
		outdir: "/missing/out",
		outputStructure: "virtual-modules" as const,
	};
	await expect(compile(options)).rejects.toThrow(
		"requires the Paraglide Vite plugin"
	);
	await expect(
		compileCatalog({
			catalog: { settings: {} as never, bundles: [] },
			compilerOptions: options,
		})
	).rejects.toThrow("requires the Paraglide Vite plugin");
	await expect(
		compileProject({ project: {} as never, compilerOptions: options })
	).rejects.toThrow("requires the Paraglide Vite plugin");
	const plugins = unpluginFactory(options, { framework: "rollup" });
	const plugin = Array.isArray(plugins) ? plugins[0]! : plugins;
	if (typeof plugin.buildStart !== "function")
		throw new Error("Missing buildStart");
	const originalEnv = process.env.NODE_ENV;
	try {
		process.env.NODE_ENV = "production";
		await expect(
			plugin.buildStart.call({ addWatchFile() {} } as never)
		).rejects.toThrow("requires the Paraglide Vite plugin");
	} finally {
		if (originalEnv === undefined) delete process.env.NODE_ENV;
		else process.env.NODE_ENV = originalEnv;
	}
});
