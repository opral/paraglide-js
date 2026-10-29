import { test, expect, vi } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { createServer, build } from "vite";
import { paraglideVitePlugin } from "./vite.js";

test("Vite defaults to virtual messages and preserves aliases, edits, additions/removals, cold restarts and tree shaking", async () => {
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
				default: "DEFAULT_VALUE_EXCLUDED_BY_BARREL",
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
			expect(
				(await server.ssrLoadModule("/src/entry.ts")).m.default
			).toBeUndefined();
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
		expect(
			await fs.readFile(path.join(outdir, "messages.js"), "utf8")
		).toContain("virtual:paraglide/");
		expect(
			await fs.readFile(path.join(outdir, "messages.virtual.d.ts"), "utf8")
		).toContain("declare module");
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
		outputStructure: "virtual-modules" as const,
	};
	expect(() =>
		paraglideVitePlugin({ ...common, emitTsDeclarations: false })
	).toThrow("requires emitTsDeclarations");
	expect(() =>
		paraglideVitePlugin({ ...common, experimentalPerLocaleBuild: true })
	).toThrow("cannot be combined");
	expect(() =>
		paraglideVitePlugin({ ...common, messageModuleSize: 64 })
	).toThrow("messageModuleSize");
});

test.each([
	["messageModuleSize: 64", "messageModuleSize"],
	["emitTsDeclarations: false", "emitTsDeclarations"],
])(
	"virtual messages reject incompatible config-file options before publication: %s",
	async (option, expected) => {
		const root = await fs.realpath(
			await fs.mkdtemp(path.join(tmpdir(), "paraglide-virtual-config-"))
		);
		const originalEnv = process.env.NODE_ENV;
		try {
			process.env.NODE_ENV = "production";
			await fs.mkdir(path.join(root, "project.inlang"));
			await fs.mkdir(path.join(root, "out"));
			await fs.writeFile(path.join(root, "package.json"), '{"type":"module"}');
			await fs.writeFile(
				path.join(root, "project.inlang/paraglide.config.js"),
				`export default {${option}};`
			);
			await fs.writeFile(path.join(root, "entry.js"), "export {};");
			await fs.writeFile(path.join(root, "out/keep.txt"), "UNCHANGED");
			await expect(
				build({
					root,
					configFile: false,
					logLevel: "silent",
					plugins: [
						paraglideVitePlugin({
							project: path.join(root, "project.inlang"),
							outdir: path.join(root, "out"),
							outputStructure: "virtual-modules" as const,
						}),
					],
					build: {
						write: false,
						rollupOptions: { input: path.join(root, "entry.js") },
					},
				})
			).rejects.toThrow(expected);
			expect(await fs.readFile(path.join(root, "out/keep.txt"), "utf8")).toBe(
				"UNCHANGED"
			);
		} finally {
			process.env.NODE_ENV = originalEnv;
			await fs.rm(root, { recursive: true, force: true });
		}
	}
);

test("two virtual outputs keep their static import indexes isolated through additions and edits", async () => {
	const root = await fs.realpath(
		await fs.mkdtemp(path.join(tmpdir(), "paraglide-virtual-multiple-"))
	);
	const originalEnv = process.env.NODE_ENV;
	let server: Awaited<ReturnType<typeof createServer>> | undefined;
	try {
		process.env.NODE_ENV = "development";
		await fs.writeFile(path.join(root, "package.json"), '{"type":"module"}');
		const projects = [];
		for (const name of ["one", "two"]) {
			const directory = path.join(root, name);
			await fs.mkdir(path.join(directory, "project.inlang"), {
				recursive: true,
			});
			await fs.writeFile(
				path.join(directory, "project.inlang/settings.json"),
				JSON.stringify({
					baseLocale: "en",
					locales: ["en"],
					modules: ["./plugin.js"],
				})
			);
			await fs.writeFile(
				path.join(directory, "plugin.js"),
				`export default {key:"plugin.fixture.${name}",toBeImportedFiles:async()=>[{path:"./messages.json",locale:"en"}],importFiles:({files})=>{const entries=Object.entries(JSON.parse(new TextDecoder().decode(files[0].content)));return {bundles:entries.map(([id])=>({id})),messages:entries.map(([id])=>({bundleId:id,locale:"en"})),variants:entries.map(([id,value])=>({messageBundleId:id,messageLocale:"en",pattern:[{type:"text",value}]}))}}};`
			);
			await fs.writeFile(
				path.join(directory, "messages.json"),
				JSON.stringify({ greeting: name })
			);
			projects.push({
				project: path.join(directory, "project.inlang"),
				outdir: path.join(directory, "out"),
				outputStructure: "virtual-modules" as const,
				strategy: ["baseLocale" as const],
				emitReadme: false,
				emitGitIgnore: false,
				emitPrettierIgnore: false,
			});
		}
		const entry = path.join(root, "entry.js");
		await fs.writeFile(
			entry,
			`import {m as one} from './one/out/messages.js';import {m as two} from './two/out/messages.js';export const values=[one.greeting(),two.greeting()];`
		);
		server = await createServer({
			root,
			configFile: false,
			logLevel: "silent",
			plugins: projects.map((options) => paraglideVitePlugin(options)),
			optimizeDeps: { noDiscovery: true },
			server: { port: 0, watch: null },
		});
		await server.listen();
		await server.pluginContainer.buildStart({});
		expect((await server.ssrLoadModule("/entry.js")).values).toEqual([
			"one",
			"two",
		]);
		for (const [index, name] of ["one", "two"].entries()) {
			const file = path.join(root, name, "messages.json");
			await fs.writeFile(
				file,
				JSON.stringify({ greeting: `${name}_edited`, added: `${name}_added` })
			);
			await server.pluginContainer.watchChange(file, { event: "update" });
			const source =
				index === 0
					? `import {m as one} from './one/out/messages.js';import {m as two} from './two/out/messages.js';export const values=[one.added(),two.greeting()];`
					: `import {m as one} from './one/out/messages.js';import {m as two} from './two/out/messages.js';export const values=[one.added(),two.added()];`;
			await fs.writeFile(entry, source);
			server.moduleGraph.invalidateAll();
			expect((await server.ssrLoadModule("/entry.js")).values).toEqual(
				index === 0 ? ["one_added", "two"] : ["one_added", "two_added"]
			);
		}
	} finally {
		await server?.close();
		process.env.NODE_ENV = originalEnv;
		await fs.rm(root, { recursive: true, force: true });
	}
});
