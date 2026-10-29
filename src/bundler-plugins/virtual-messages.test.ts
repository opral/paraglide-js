import { test, expect, vi } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { createServer, build } from "vite";
import { paraglideVitePlugin } from "./vite.js";

test("virtual messages preserve aliases, edits, additions/removals, cold restarts and tree shaking", async () => {
	const root = await fs.realpath(
		await fs.mkdtemp(path.join(tmpdir(), "paraglide-virtual-integration-"))
	);
	const originalEnv = process.env.NODE_ENV;
	const project = path.join(root, "project.inlang");
	const outdir = path.join(root, "src/paraglide");
	try {
		process.env.NODE_ENV = "development";
		await fs.mkdir(project, { recursive: true });
		await fs.mkdir(path.join(root, "src"), { recursive: true });
		await fs.writeFile(path.join(root, "package.json"), '{"type":"module"}');
		await fs.writeFile(
			path.join(root, "tsconfig.json"),
			JSON.stringify({
				compilerOptions: { baseUrl: ".", paths: { "@/*": ["src/*"] } },
			})
		);
		await fs.writeFile(
			path.join(project, "settings.json"),
			JSON.stringify({
				baseLocale: "en",
				locales: ["en"],
				modules: ["./fixture-plugin.js"],
			})
		);
		await fs.writeFile(
			path.join(root, "fixture-plugin.js"),
			`export default {key:"plugin.fixture.virtual",toBeImportedFiles:async()=>[{path:"./messages.json",locale:"en"}],importFiles:({files})=>{
   const entries=Object.entries(JSON.parse(new TextDecoder().decode(files[0].content)));
   return {bundles:entries.map(([id])=>({id})),messages:entries.map(([id])=>({bundleId:id,locale:"en"})),variants:entries.map(([id,value])=>({messageBundleId:id,messageLocale:"en",pattern:[{type:"text",value}]}))};
  }};`
		);
		const resources = path.join(root, "messages.json");
		await fs.writeFile(
			resources,
			JSON.stringify({
				greeting: "FIRST",
				unused: "UNUSED_TREE_SHAKE_SENTINEL",
			})
		);
		await fs.writeFile(
			path.join(root, "src/entry.ts"),
			'export { m } from "@/paraglide/messages";'
		);
		const options = {
			project,
			outdir,
			experimentalVirtualMessages: true,
			strategy: ["baseLocale"] as const,
			emitGitIgnore: false,
			emitPrettierIgnore: false,
			emitReadme: false,
		};
		const start = async () => {
			const server = await createServer({
				root,
				configFile: false,
				logLevel: "silent",
				plugins: [
					paraglideVitePlugin({ ...options, strategy: [...options.strategy] }),
				],
				resolve: { tsconfigPaths: true },
				optimizeDeps: { noDiscovery: true },
				server: { port: 0 },
			});
			await server.listen();
			await server.environments.ssr!.pluginContainer.buildStart({});
			return server;
		};
		let server = await start();
		try {
			expect((await server.ssrLoadModule("/src/entry.ts")).m.greeting()).toBe(
				"FIRST"
			);
			await fs.writeFile(
				resources,
				JSON.stringify({
					greeting: "EDITED",
					added: "ADDED",
					unused: "UNUSED_TREE_SHAKE_SENTINEL",
				})
			);
			await vi.waitFor(
				async () =>
					expect(
						(await server.ssrLoadModule("/src/entry.ts")).m.added?.()
					).toBe("ADDED"),
				{ timeout: 10_000 }
			);
			expect((await server.ssrLoadModule("/src/entry.ts")).m.greeting()).toBe(
				"EDITED"
			);
			await fs.writeFile(
				resources,
				JSON.stringify({
					greeting: "FINAL",
					unused: "UNUSED_TREE_SHAKE_SENTINEL",
				})
			);
			await vi.waitFor(
				async () => {
					const { m } = await server.ssrLoadModule("/src/entry.ts");
					expect(m.greeting()).toBe("FINAL");
					expect(m.added).toBeUndefined();
				},
				{ timeout: 10_000 }
			);
			// Failed imports must leave the last published virtual graph usable.
			await fs.writeFile(resources, "{");
			await server.pluginContainer.watchChange(resources, { event: "update" });
			expect((await server.ssrLoadModule("/src/entry.ts")).m.greeting()).toBe(
				"FINAL"
			);
			await fs.writeFile(
				resources,
				JSON.stringify({
					greeting: "RECOVERED",
					unused: "UNUSED_TREE_SHAKE_SENTINEL",
				})
			);
			await vi.waitFor(
				async () =>
					expect(
						(await server.ssrLoadModule("/src/entry.ts")).m.greeting()
					).toBe("RECOVERED"),
				{ timeout: 10_000 }
			);
		} finally {
			await server.close();
		}
		expect(await fs.readdir(outdir)).toEqual(
			expect.arrayContaining(["messages.d.ts", "runtime.js", "runtime.d.ts"])
		);
		await expect(fs.access(path.join(outdir, "messages.js"))).rejects.toThrow();
		await expect(fs.access(path.join(outdir, "messages"))).rejects.toThrow();
		// A new plugin instance must recreate implementations even when disk files match.
		server = await start();
		try {
			expect((await server.ssrLoadModule("/src/entry.ts")).m.greeting()).toBe(
				"RECOVERED"
			);
		} finally {
			await server.close();
		}
		process.env.NODE_ENV = "production";
		await fs.writeFile(
			path.join(root, "src/entry.ts"),
			'import {m} from "@/paraglide/messages.js"; console.log(m.greeting());'
		);
		const result = await build({
			root,
			configFile: false,
			logLevel: "silent",
			plugins: [
				paraglideVitePlugin({ ...options, strategy: [...options.strategy] }),
			],
			resolve: { tsconfigPaths: true },
			build: {
				write: false,
				minify: false,
				rollupOptions: { input: path.join(root, "src/entry.ts") },
			},
		});
		const builds = Array.isArray(result) ? result : [result];
		const code = builds
			.flatMap((result) => ("output" in result ? result.output : []))
			.filter((asset) => asset.type === "chunk")
			.map((chunk) => chunk.code)
			.join("\n");
		expect(code).toContain("RECOVERED");
		expect(code).not.toContain("UNUSED_TREE_SHAKE_SENTINEL");
	} finally {
		if (originalEnv === undefined) delete process.env.NODE_ENV;
		else process.env.NODE_ENV = originalEnv;
		await fs.rm(root, { recursive: true, force: true });
	}
}, 30_000);

test("virtual messages reject incompatible output options", () => {
	const common = {
		project: "./project.inlang",
		experimentalVirtualMessages: true,
	};
	expect(() =>
		paraglideVitePlugin({ ...common, emitTsDeclarations: false })
	).toThrow("requires emitTsDeclarations");
	expect(() =>
		paraglideVitePlugin({ ...common, outputStructure: "locale-modules" })
	).toThrow("requires message-modules");
	expect(() =>
		paraglideVitePlugin({ ...common, experimentalPerLocaleBuild: true })
	).toThrow("cannot be combined");
});
