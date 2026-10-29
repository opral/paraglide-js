import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { gzipSync } from "node:zlib";
const exec = promisify(execFile);
const root = fileURLToPath(new URL("../../", import.meta.url));
const self = fileURLToPath(import.meta.url);
const args = process.argv.slice(2);
const option = (key, fallback) =>
	args.find((arg) => arg.startsWith(`--${key}=`))?.slice(key.length + 3) ??
	fallback;
const count = Number(option("count", "20000"));
const routeCount = Number(option("routes", "100"));
const rounds = Number(option("rounds", "3"));
const destination = option(
	"output",
	"/tmp/paraglide-production-benchmark.json"
);
const scenarios = [
	{ name: "disk-message", size: 1 },
	{ name: "disk-group-64", size: 64 },
	{ name: "virtual-single", size: 1, virtual: true },
];
const measure = async (operation) => {
	const start = performance.now();
	const value = await operation();
	return { ms: performance.now() - start, value };
};
async function walk(directory) {
	const entries = await fs
		.readdir(directory, { withFileTypes: true })
		.catch(() => []);
	return (
		await Promise.all(
			entries.map(async (entry) =>
				entry.isDirectory()
					? walk(path.join(directory, entry.name))
					: [path.join(directory, entry.name)]
			)
		)
	).flat();
}
if (args.includes("--worker")) {
	const directory = option("directory");
	const scenario = scenarios.find((s) => s.name === option("scenario"));
	const { paraglideVitePlugin } = await import("../../dist/index.js");
	const { createServer } = await import("vite");
	const outdir = path.join(directory, "src/paraglide");
	const plugin = paraglideVitePlugin({
		project: path.join(directory, "project.inlang"),
		outdir,
		outputStructure: "message-modules",
		emitTsDeclarations: true,
		emitGitIgnore: false,
		emitReadme: false,
		emitPrettierIgnore: false,
		messageModuleSize: scenario.size,
		experimentalVirtualMessages: !!scenario.virtual,
		strategy: ["baseLocale"],
	});
	const cold = await measure(async () => {
		const server = await createServer({
			root: directory,
			configFile: false,
			logLevel: "silent",
			plugins: [plugin],
			optimizeDeps: { noDiscovery: true },
			server: { watch: null, port: 0 },
		});
		await server.listen();
		await server.pluginContainer.buildStart({});
		return server;
	});
	const server = cold.value;
	try {
		await fs.writeFile(
			path.join(directory, "src/entry.js"),
			'import { m } from "./paraglide/messages.js"; export const value=m.message_0({name:"Ada"});'
		);
		const graph = await measure(() => server.ssrLoadModule("/src/entry.js"));
		assert.equal(graph.value.value, "en_SENTINEL_0_ Ada");
		const updates = [];
		const file = path.join(directory, "messages/en.json");
		const messages = JSON.parse(await fs.readFile(file, "utf8"));
		for (let i = 0; i < 5; i++) {
			messages.message_0 = `EDITED_${i}_ {name}`;
			const source = JSON.stringify(messages);
			const edited = await measure(async () => {
				await fs.writeFile(file, source);
				await server.pluginContainer.watchChange(file, { event: "update" });
			});
			updates.push(edited.ms);
		}
		console.log(
			"BENCHMARK_RESULT " +
				JSON.stringify({
					scenario: scenario.name,
					coldCompilerAndViteMs: cold.ms,
					initialSsrGraphMs: graph.ms,
					updatesMs: updates,
					files: (await walk(outdir)).length,
				})
		);
	} finally {
		await server.close();
	}
	process.exit(0);
}
const workspace = await fs.realpath(
	await fs.mkdtemp(path.join(os.tmpdir(), "paraglide-production-benchmark-"))
);
const results = [];
const metadata = {
	node: process.version,
	cpu: os.cpus()[0].model,
	count,
	locales: ["en", "de", "fr"],
	routes: routeCount,
	usedMessages: Math.floor(count * 0.1),
	rounds,
	workspace,
	note: "Generated framework applications, not a customer production app. Fresh build processes and empty output dirs; warm OS caches and cached SDK plugin downloads. Sequential timings; no dependency installation/network included.",
};
const checkpoint = () =>
	fs.writeFile(destination, JSON.stringify({ metadata, results }, null, 2));
async function command(directory, script, argv) {
	const start = performance.now();
	try {
		const result = await exec(process.execPath, [script, ...argv], {
			cwd: directory,
			timeout: 300000,
			maxBuffer: 32 * 1024 * 1024,
			env: { ...process.env, NO_COLOR: "1" },
		});
		return {
			ms: performance.now() - start,
			log: result.stdout + result.stderr,
		};
	} catch (error) {
		await fs.writeFile(
			path.join(workspace, "failure.log"),
			error.stdout + "\n" + error.stderr
		);
		throw new Error(
			`${script} ${argv.join(" ")} failed: ${(error.stdout + "\n" + error.stderr).slice(-12000)}`
		);
	}
}
function options(directory, scenario, framework) {
	return {
		project: path.join(directory, "project.inlang"),
		outdir: path.join(
			directory,
			framework === "sveltekit" ? "src/lib/paraglide" : "src/paraglide"
		),
		strategy: ["baseLocale"],
		outputStructure: "message-modules",
		messageModuleSize: scenario.size,
		experimentalVirtualMessages: !!scenario.virtual,
		emitTsDeclarations: true,
		emitGitIgnore: false,
		emitReadme: false,
		emitPrettierIgnore: false,
	};
}
const catalog = Object.fromEntries(
	["en", "de", "fr"].map((locale) => [
		locale,
		Object.fromEntries(
			Array.from({ length: count }, (_, i) => [
				`message_${i}`,
				`${locale}_SENTINEL_${i}_ {name}`,
			])
		),
	])
);
async function resources(directory) {
	await fs.mkdir(path.join(directory, "project.inlang"), { recursive: true });
	await fs.mkdir(path.join(directory, "messages"), { recursive: true });
	await fs.writeFile(
		path.join(directory, "project.inlang/settings.json"),
		JSON.stringify({
			baseLocale: "en",
			locales: ["en", "de", "fr"],
			modules: [
				"https://cdn.jsdelivr.net/npm/@inlang/plugin-message-format@4.5.0/dist/index.js",
			],
			"plugin.inlang.messageFormat": {
				pathPattern: "./messages/{locale}.json",
			},
		})
	);
	await fs.writeFile(
		path.join(directory, "project.inlang/paraglide.config.js"),
		"export default {};"
	);
	for (const locale of ["en", "de", "fr"])
		await fs.writeFile(
			path.join(directory, `messages/${locale}.json`),
			JSON.stringify(catalog[locale])
		);
}
async function prepare(framework, scenario) {
	const directory = path.join(workspace, `${framework}-${scenario.name}`);
	if (framework === "compiler") {
		await fs.mkdir(path.join(directory, "src"), { recursive: true });
		await fs.writeFile(
			path.join(directory, "package.json"),
			'{"type":"module"}'
		);
	} else {
		const example = path.join(root, "examples", framework);
		await fs.cp(example, directory, {
			recursive: true,
			filter: (source) =>
				!/(?:^|\/)(node_modules|\.svelte-kit|\.output|\.tanstack|dist|build|cache|paraglide|routes)(?:\/|$)/.test(
					path.relative(example, source)
				),
		});
		await fs.symlink(
			path.join(example, "node_modules"),
			path.join(directory, "node_modules"),
			"dir"
		);
	}
	await resources(directory);
	if (framework !== "compiler") {
		const opts = JSON.stringify(options(directory, scenario, framework));
		if (framework === "sveltekit") {
			await fs.writeFile(
				path.join(directory, "vite.config.ts"),
				`import {sveltekit} from '@sveltejs/kit/vite';import {defineConfig} from 'vite';import {paraglideVitePlugin} from '@inlang/paraglide-js';export default defineConfig({plugins:[sveltekit(),paraglideVitePlugin(${opts})],build:{reportCompressedSize:false}});`
			);
			await fs.writeFile(
				path.join(directory, "svelte.config.js"),
				`import adapter from '@sveltejs/adapter-auto';import {vitePreprocess} from '@sveltejs/vite-plugin-svelte';export default {preprocess:vitePreprocess(),kit:{adapter:adapter()}};`
			);
			await fs.mkdir(path.join(directory, "src/routes"), { recursive: true });
			await fs.writeFile(
				path.join(directory, "src/routes/+layout.svelte"),
				`<script lang="ts">let {children}: {children: import('svelte').Snippet}=$props();</script>{@render children()}`
			);
		} else {
			// The generated routes do not use the example's two-locale URL helpers.
			await fs.rm(path.join(directory, "src/utils"), {
				recursive: true,
				force: true,
			});
			await fs.writeFile(
				path.join(directory, "vite.config.ts"),
				`import {paraglideVitePlugin} from '@inlang/paraglide-js';import {defineConfig} from 'vite';import {tanstackStart} from '@tanstack/react-start/plugin/vite';import react from '@vitejs/plugin-react';export default defineConfig({resolve:{tsconfigPaths:true},plugins:[paraglideVitePlugin(${opts}),tanstackStart(),react()],build:{reportCompressedSize:false}});`
			);
			await fs.mkdir(path.join(directory, "src/routes"), { recursive: true });
			await fs.writeFile(
				path.join(directory, "src/routes/__root.tsx"),
				`import {HeadContent,Scripts,createRootRoute} from '@tanstack/react-router';export const Route=createRootRoute({shellComponent:Root});function Root({children}:{children:React.ReactNode}) {return <html lang="en"><head><HeadContent/></head><body>{children}<Scripts/></body></html>}`
			);
		}
		const perRoute = Math.floor((count * 0.1) / routeCount);
		for (let route = 0; route < routeCount; route++) {
			const calls = Array.from(
				{ length: perRoute },
				(_, i) => `m.message_${route * perRoute + i}({name:'Ada'})`
			).join(",");
			if (framework === "sveltekit") {
				const pageDirectory = path.join(
					directory,
					"src/routes",
					route ? `page_${route}` : ""
				);
				await fs.mkdir(pageDirectory, { recursive: true });
				await fs.writeFile(
					path.join(pageDirectory, "+page.svelte"),
					`<script lang="ts">import {m} from '$lib/paraglide/messages.js';const values=[${calls}];</script><h1>route_${route}</h1>{#each values as value}<p>{value}</p>{/each}`
				);
			} else {
				const pathname = route ? `/page_${route}` : "/";
				await fs.writeFile(
					path.join(
						directory,
						`src/routes/${route ? `page_${route}` : "index"}.tsx`
					),
					`import {createFileRoute} from '@tanstack/react-router';import {m} from '@/paraglide/messages.js';export const Route=createFileRoute('${pathname}')({component:Page});function Page(){const values=[${calls}];return <main><h1>route_${route}</h1>{values.map((value,i)=><p key={i}>{value}</p>)}</main>}`
				);
			}
		}
	}
	// Download/cache the SDK importer outside the timing, then discard all generated output.
	const { compile } = await import("../../dist/index.js");
	const { experimentalVirtualMessages, ...opts } = options(
		directory,
		scenario,
		framework
	);
	await compile(opts);
	await fs.rm(opts.outdir, { recursive: true, force: true });
	return directory;
}
console.log(`Workspace ${workspace}`);
for (const scenario of scenarios) {
	const directory = await prepare("compiler", scenario);
	for (let round = 0; round < rounds; round++) {
		await fs.rm(path.join(directory, "src/paraglide"), {
			recursive: true,
			force: true,
		});
		await fs.writeFile(
			path.join(directory, "messages/en.json"),
			JSON.stringify(catalog.en)
		);
		const result = await command(root, self, [
			"--worker",
			`--directory=${directory}`,
			`--scenario=${scenario.name}`,
		]);
		const record = {
			kind: "integrated-compiler",
			round,
			...JSON.parse(result.log.match(/BENCHMARK_RESULT (.*)/)[1]),
		};
		results.push(record);
		await checkpoint();
		console.log(JSON.stringify(record));
	}
}
const packages = await fs.readdir(path.join(root, "node_modules/.pnpm"));
const checker = path.join(
	root,
	"node_modules/.pnpm",
	packages.find((p) => p.startsWith("svelte-check@")),
	"node_modules/svelte-check/bin/svelte-check"
);
for (const framework of ["sveltekit", "tanstack-start"]) {
	const directories = new Map();
	for (const scenario of scenarios)
		directories.set(scenario.name, await prepare(framework, scenario));
	for (let round = 0; round < rounds; round++) {
		const order = [
			...scenarios.slice(round % 3),
			...scenarios.slice(0, round % 3),
		];
		for (const scenario of order) {
			const directory = directories.get(scenario.name);
			const local = createRequire(path.join(directory, "package.json"));
			const vite = path.join(
				path.dirname(local.resolve("vite/package.json")),
				"bin/vite.js"
			);
			const tsc = path.join(
				path.dirname(local.resolve("typescript/package.json")),
				"bin/tsc"
			);
			const outdir = options(directory, scenario, framework).outdir;
			for (const target of [
				outdir,
				path.join(directory, ".svelte-kit"),
				path.join(directory, "dist"),
				path.join(directory, ".output"),
				path.join(directory, ".tanstack"),
				path.join(directory, "node_modules/.vite"),
			]) {
				// node_modules is a shared symlink; leave its dependency cache untouched.
				if (!target.includes("node_modules"))
					await fs.rm(target, { recursive: true, force: true });
			}
			const built = await command(directory, vite, ["build"]);
			const checked = await command(
				directory,
				framework === "sveltekit" ? checker : tsc,
				framework === "sveltekit"
					? [
							"--tsconfig",
							path.join(directory, "tsconfig.json"),
							"--fail-on-warnings",
						]
					: ["--noEmit"]
			);
			const assetsRoot = path.join(
				directory,
				framework === "sveltekit" ? ".svelte-kit/output/client" : "dist/client"
			);
			const js = (await walk(assetsRoot)).filter((file) =>
				file.endsWith(".js")
			);
			assert.ok(js.length > 10, "Expected route splitting");
			const chunks = await Promise.all(js.map((file) => fs.readFile(file)));
			const code = chunks.map((buf) => buf.toString()).join("\n");
			const retainedUnusedMessages = new Set(
				[...code.matchAll(/_SENTINEL_(\d+)_/g)]
					.map((match) => Number(match[1]))
					.filter((id) => id >= Math.floor(count * 0.1))
			).size;
			if (scenario.size === 1)
				assert.equal(
					retainedUnusedMessages,
					0,
					"Unused messages leaked into individual client modules"
				);
			assert.ok(code.includes("_SENTINEL_0_"), "Missing used message");
			const record = {
				kind: "framework",
				framework,
				round,
				scenario: scenario.name,
				buildMs: built.ms,
				typecheckMs: checked.ms,
				pipelineMs: built.ms + checked.ms,
				outdirFiles: (await walk(outdir)).length,
				clientChunks: js.length,
				retainedUnusedMessages,
				clientJsBytes: chunks.reduce((sum, buf) => sum + buf.length, 0),
				clientGzipBytes: chunks.reduce(
					(sum, buf) => sum + gzipSync(buf).length,
					0
				),
			};
			results.push(record);
			await checkpoint();
			console.log(JSON.stringify(record));
		}
	}
}
console.log(`Saved ${destination}; fixture workspace retained: ${workspace}`);
