import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { paraglideVitePlugin, compile } from "../../dist/index.js";
const root = fileURLToPath(new URL("../../", import.meta.url));
const store = path.join(root, "node_modules/.pnpm");
const packages = await fs.readdir(store);
const results = [];
for (const major of [5, 6, 7, 8]) {
	const installed = packages.find((name) => name.startsWith(`vite@${major}.`));
	assert.ok(installed, `Install Vite ${major} to run this matrix`);
	const vite = await import(
		path.join(store, installed, "node_modules/vite/dist/node/index.js")
	);
	const directory = await fs.realpath(
		await fs.mkdtemp(path.join(os.tmpdir(), `paraglide-vite${major}-`))
	);
	const originalEnv = process.env.NODE_ENV;
	let server;
	try {
		await fs.mkdir(path.join(directory, "project.inlang"));
		await fs.mkdir(path.join(directory, "src"));
		await fs.writeFile(
			path.join(directory, "package.json"),
			'{"type":"module"}'
		);
		await fs.writeFile(
			path.join(directory, "project.inlang/settings.json"),
			JSON.stringify({
				baseLocale: "en",
				locales: ["en"],
				modules: ["./fixture-plugin.js"],
			})
		);
		await fs.writeFile(
			path.join(directory, "fixture-plugin.js"),
			`export default {key:"plugin.fixture.versions",toBeImportedFiles:async()=>[{path:"./messages.json",locale:"en"}],importFiles:()=>({bundles:[{id:"greeting"},{id:"unused"}],messages:[{bundleId:"greeting",locale:"en"},{bundleId:"unused",locale:"en"}],variants:[{messageBundleId:"greeting",messageLocale:"en",pattern:[{type:"text",value:"HELLO_VIRTUAL"}]},{messageBundleId:"unused",messageLocale:"en",pattern:[{type:"text",value:"UNUSED_SENTINEL"}]}]})};`
		);
		await fs.writeFile(path.join(directory, "messages.json"), "{}");
		await fs.writeFile(
			path.join(directory, "src/entry.js"),
			'import {m} from "@/paraglide/messages.js"; export const value=m.greeting();'
		);
		const options = {
			project: path.join(directory, "project.inlang"),
			outdir: path.join(directory, "src/paraglide"),
			strategy: ["baseLocale"],
			emitTsDeclarations: true,
			emitGitIgnore: false,
			emitPrettierIgnore: false,
			emitReadme: false,
		};
		// Start with ordinary disk output to verify migration removes obsolete files.
		await compile({ ...options, outputStructure: "message-modules" });
		assert.ok((await fs.readdir(options.outdir)).includes("messages.js"));
		const config = {
			root: directory,
			configFile: false,
			logLevel: "silent",
			resolve: { alias: { "@": path.join(directory, "src") } },
			plugins: [paraglideVitePlugin({ ...options })],
		};
		process.env.NODE_ENV = "development";
		server = await vite.createServer({
			...config,
			optimizeDeps: { noDiscovery: true },
			server: { port: 0, watch: null },
		});
		await server.listen();
		await server.pluginContainer.buildStart({});
		assert.equal(
			(await server.ssrLoadModule("/src/entry.js")).value,
			"HELLO_VIRTUAL"
		);
		assert.equal((await fs.readdir(options.outdir)).length, 9);
		await server.close();
		server = undefined;
		process.env.NODE_ENV = "production";
		const built = await vite.build({
			...config,
			plugins: [paraglideVitePlugin({ ...options })],
			build: {
				write: false,
				minify: false,
				rollupOptions: {
					input: path.join(directory, "src/entry.js"),
					preserveEntrySignatures: "strict",
				},
			},
		});
		const code = built.output
			.filter((asset) => asset.type === "chunk")
			.map((chunk) => chunk.code)
			.join("\n");
		assert.ok(code.includes("HELLO_VIRTUAL"));
		assert.ok(!code.includes("UNUSED_SENTINEL"));
		results.push({
			vite: JSON.parse(
				await fs.readFile(
					path.join(store, installed, "node_modules/vite/package.json")
				)
			).version,
			devSsr: true,
			productionBuild: true,
			treeShaking: true,
			diskMigration: true,
		});
	} finally {
		await server?.close();
		if (originalEnv === undefined) delete process.env.NODE_ENV;
		else process.env.NODE_ENV = originalEnv;
		await fs.rm(directory, { recursive: true, force: true });
	}
}
console.log(JSON.stringify(results, null, 2));
await fs.writeFile(
	path.join(os.tmpdir(), "paraglide-vite-versions-results.json"),
	JSON.stringify(results, null, 2)
);
