import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { execFile, spawn } from "node:child_process";
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
const rounds = Number(option("rounds", "5"));
const destination = option("output", "/tmp/paraglide-virtual-ab.json");
const scenarios = [
	{ name: "disk-message", size: 1, virtual: false },
	{ name: "virtual-message", size: 1, virtual: true },
];
const allScenarios = scenarios;
const ordered = (round) => (round % 2 ? [...scenarios].reverse() : scenarios);
const usedMessages = routeCount * Math.floor((count * 0.1) / routeCount);
assert.ok(Number.isSafeInteger(rounds) && rounds > 0);
assert.ok(
	Number.isSafeInteger(count) &&
		count >= 10 * routeCount &&
		Number.isSafeInteger(routeCount) &&
		routeCount > 0,
	"Need at least ten message IDs per route"
);

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
async function outputStats(directory) {
	const files = await walk(directory);
	let bytes = 0,
		declarationBytes = 0,
		cursor = 0;
	await Promise.all(
		Array.from({ length: 8 }, async () => {
			while (cursor < files.length) {
				const file = files[cursor++];
				const size = (await fs.stat(file)).size;
				bytes += size;
				if (file.endsWith(".d.ts")) declarationBytes += size;
			}
		})
	);
	return { files: files.length, bytes, declarationBytes };
}

if (args.includes("--http-worker")) {
	const directory = option("directory");
	const production = args.includes("--production");
	const local = createRequire(path.join(directory, "package.json"));
	const vite = path.join(
		path.dirname(local.resolve("vite/package.json")),
		"bin/vite.js"
	);
	const started = performance.now();
	const child = spawn(
		process.execPath,
		[
			vite,
			...(production ? ["preview"] : []),
			"--host",
			"127.0.0.1",
			"--port",
			"0",
		],
		{
			cwd: directory,
			env: { ...process.env, NO_COLOR: "1" },
			stdio: ["ignore", "pipe", "pipe"],
		}
	);
	let log = "";
	try {
		const ready = await new Promise((resolve, reject) => {
			const timer = setTimeout(
				() => reject(new Error("Server readiness timeout:\n" + log)),
				120000
			);
			const receive = (data) => {
				log += data;
				const match = log.match(/Local:\s+(http:\/\/127\.0\.0\.1:\d+\/)/);
				if (match) {
					clearTimeout(timer);
					resolve({ url: match[1], time: performance.now() });
				}
			};
			child.stdout.on("data", receive);
			child.stderr.on("data", receive);
			child.once("exit", (code) => {
				clearTimeout(timer);
				reject(new Error(`Server exited ${code}:\n${log}`));
			});
		});
		// No HTTP readiness probe: this is the first request to the application.
		const first = await fetch(ready.url, {
			signal: AbortSignal.timeout(60000),
		});
		const html = await first.text();
		const firstCompleted = performance.now();
		assert.equal(first.status, 200, html.slice(0, 2000) + "\n" + log);
		assert.ok(
			html.includes("en_SENTINEL_0_ Ada"),
			html.slice(0, 2000) + "\n" + log
		);
		const warmRequestsMs = [];
		for (let i = 0; i < 3; i++) {
			const start = performance.now();
			const response = await fetch(ready.url, {
				signal: AbortSignal.timeout(60000),
			});
			const text = await response.text();
			assert.equal(response.status, 200);
			assert.ok(text.includes("en_SENTINEL_0_ Ada"));
			warmRequestsMs.push(performance.now() - start);
		}
		const edits = [];
		if (!production) {
			const file = path.join(directory, "messages/en.json");
			const messages = JSON.parse(await fs.readFile(file, "utf8"));
			for (let i = 0; i < 3; i++) {
				const sentinel = `HTTP_EDIT_${i}_`;
				messages.message_0 = sentinel + " {name}";
				const source = JSON.stringify(messages);
				const start = performance.now();
				await fs.writeFile(file, source);
				let requests = 0,
					transientErrors = 0;
				while (true) {
					const response = await fetch(ready.url, {
						signal: AbortSignal.timeout(60000),
					});
					const text = await response.text();
					requests++;
					if (response.status === 200 && text.includes(sentinel + " Ada"))
						break;
					if (response.status !== 200) transientErrors++;
					assert.ok(
						performance.now() - start < 60000,
						"Updated HTML timeout:\n" + log
					);
					await new Promise((resolve) => setTimeout(resolve, 50));
				}
				edits.push({
					ms: performance.now() - start,
					requests,
					transientErrors,
				});
			}
		}
		console.log(
			"BENCHMARK_RESULT " +
				JSON.stringify({
					readyMs: ready.time - started,
					startToFirstHtmlMs: firstCompleted - started,
					readyToFirstHtmlMs: firstCompleted - ready.time,
					warmRequestsMs,
					edits,
					pollIntervalMs: 50,
				})
		);
	} finally {
		if (child.exitCode === null)
			await new Promise((resolve) => {
				child.once("exit", resolve);
				child.kill();
			});
	}
	process.exit(0);
}
if (args.includes("--worker")) {
	const directory = option("directory");
	const scenario = allScenarios.find((s) => s.name === option("scenario"));
	const { paraglideVitePlugin } = await import("../../dist/index.js");

	const { createServer } = await import("vite");
	const outdir = path.join(directory, "src/paraglide");
	const plugin = paraglideVitePlugin({
		project: path.join(directory, "project.inlang"),
		outdir,
		outputStructure: scenario.virtual ? "virtual-modules" : "message-modules",
		emitTsDeclarations: true,
		emitGitIgnore: false,
		emitReadme: false,
		emitPrettierIgnore: false,
		messageModuleSize: scenario.size,
		strategy: ["baseLocale"],
	});
	const compilerBuildStartCallsMs = [];
	const compiler = [plugin]
		.flat(Infinity)
		.find((p) => p.name === "unplugin-paraglide-js");
	const original =
		typeof compiler.buildStart === "function"
			? compiler.buildStart
			: compiler.buildStart.handler;
	compiler.buildStart = async function (...args) {
		const started = performance.now();
		try {
			return await original.apply(this, args);
		} finally {
			compilerBuildStartCallsMs.push(performance.now() - started);
		}
	};
	const cold = await measure(async () => {
		const server = await createServer({
			root: directory,
			configFile: false,
			cacheDir: path.join(directory, ".vite-cache"),
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
		const initialSsrModules =
			server.environments.ssr.moduleGraph.idToModuleMap.size;
		const leafId = [
			...server.environments.ssr.moduleGraph.idToModuleMap.keys(),
		].find((id) => id.endsWith("/messages/message_0.js"));
		assert.ok(leafId, "Expected the message in the SSR graph");
		const updates = [];
		const updatedSsrLoads = [];
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
			const refreshed = await measure(async () => {
				// The diagnostic disables filesystem watching: invalidate the changed
				// leaf and its importers equally for disk and virtual implementations.
				const seen = new Set();
				const invalidate = (module) => {
					if (!module || seen.has(module)) return;
					seen.add(module);
					for (const importer of module.importers) invalidate(importer);
					server.moduleGraph.invalidateModule(module);
				};
				invalidate(server.moduleGraph.getModuleById(leafId));
				return server.ssrLoadModule("/src/entry.js");
			});
			assert.equal(refreshed.value.value, `EDITED_${i}_ Ada`);
			updatedSsrLoads.push(refreshed.ms);
		}
		console.log(
			"BENCHMARK_RESULT " +
				JSON.stringify({
					scenario: scenario.name,
					coldCompilerAndViteMs: cold.ms,
					compilerBuildStartCallsMs,
					initialSsrGraphMs: graph.ms,
					updatesMs: updates,
					updatedSsrLoadsMs: updatedSsrLoads,
					initialSsrModules,
					output: await outputStats(outdir),
					maxRssKiB: process.resourceUsage().maxRSS,
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
const require = createRequire(import.meta.url);
const revision = (ref) =>
	exec("git", ["rev-parse", ref], { cwd: root }).then((r) => r.stdout.trim());
const svelteRequire = createRequire(
	path.join(root, "examples/sveltekit/package.json")
);
const tanstackRequire = createRequire(
	path.join(root, "examples/tanstack-start/package.json")
);
const metadata = {
	implementationRevision: await revision("HEAD"),
	sdkRevision: option("sdk-revision", "registry package"),
	sdkVersion: JSON.parse(
		await fs.readFile(
			path.join(root, "node_modules/@inlang/sdk/package.json"),
			"utf8"
		)
	).version,
	workingTreeDirty: !!(
		await exec("git", ["status", "--porcelain"], { cwd: root })
	).stdout.trim(),
	baselineRevision: await revision("codex/remove-additional-files"),
	versions: {
		vite: require("vite/package.json").version,
		typescript: require("typescript/package.json").version,
		sveltekit: svelteRequire("@sveltejs/kit/package.json").version,
		svelte: svelteRequire("svelte/package.json").version,
		tanstack: tanstackRequire("@tanstack/react-start/package.json").version,
		react: tanstackRequire("react/package.json").version,
		sveltekitVite: svelteRequire("vite/package.json").version,
		sveltekitTypeScript: svelteRequire("typescript/package.json").version,
		svelteCheck: svelteRequire("svelte-check/package.json").version,
		tanstackVite: tanstackRequire("vite/package.json").version,
		tanstackTypeScript: tanstackRequire("typescript/package.json").version,
	},
	node: process.version,
	cpu: os.cpus()[0].model,
	count,
	locales: ["en", "de", "fr"],
	routes: routeCount,
	usedMessages,
	rounds,
	workspace,
	baseline:
		"Individual disk message modules, emitTsDeclarations:true; same implementation revision with virtual mode off.",
	implementation:
		"outputStructure:virtual-modules; explicit physical facade, combined declarations and static imports.",
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
		outputStructure: scenario.virtual ? "virtual-modules" : "message-modules",
		messageModuleSize: scenario.size,
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
async function prepare(framework, scenario, tag) {
	const directory = path.join(
		workspace,
		`${framework}-${scenario.name}-${tag}`
	);
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
		const compilerImport =
			"import {paraglideVitePlugin} from '@inlang/paraglide-js';";
		if (framework === "sveltekit") {
			await fs.writeFile(
				path.join(directory, "vite.config.ts"),
				`import {sveltekit} from '@sveltejs/kit/vite';import {defineConfig} from 'vite';${compilerImport}export default defineConfig({cacheDir:"./.vite-cache",plugins:[sveltekit(),paraglideVitePlugin(${opts})],build:{reportCompressedSize:false}});`
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
				`${compilerImport}import {defineConfig} from 'vite';import {tanstackStart} from '@tanstack/react-start/plugin/vite';import react from '@vitejs/plugin-react';export default defineConfig({cacheDir:"./.vite-cache",resolve:{tsconfigPaths:true},plugins:[paraglideVitePlugin(${opts}),tanstackStart(),react()],build:{reportCompressedSize:false}});`
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
	const opts = options(directory, scenario, framework);
	for (const locale of ["en", "de", "fr"])
		await fs.writeFile(path.join(directory, `messages/${locale}.json`), "{}");
	await compile({ ...opts, outputStructure: "message-modules" });
	for (const locale of ["en", "de", "fr"])
		await fs.writeFile(
			path.join(directory, `messages/${locale}.json`),
			JSON.stringify(catalog[locale])
		);
	await fs.rm(path.join(directory, "project.inlang/cache/paraglide-js"), {
		recursive: true,
		force: true,
	});
	await fs.rm(opts.outdir, { recursive: true, force: true });
	return directory;
}
console.log(`Workspace ${workspace}`);
for (let round = 0; round < rounds; round++) {
	for (const scenario of ordered(round)) {
		const directory = await prepare("compiler", scenario, round);
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
	for (let round = 0; round < rounds; round++) {
		for (const scenario of ordered(round)) {
			const directory = await prepare(framework, scenario, round);
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
				path.join(directory, ".vite-cache"),
				path.join(directory, "node_modules/.vite"),
			]) {
				// node_modules is a shared symlink; leave its dependency cache untouched.
				if (!target.includes("node_modules"))
					await fs.rm(target, { recursive: true, force: true });
			}
			const dev = await command(root, self, [
				"--http-worker",
				`--directory=${directory}`,
				`--framework=${framework}`,
			]);
			const devRecord = {
				kind: "http-dev",
				framework,
				round,
				scenario: scenario.name,
				...JSON.parse(dev.log.match(/BENCHMARK_RESULT (.*)/)[1]),
			};
			results.push(devRecord);
			await checkpoint();
			console.log(JSON.stringify(devRecord));
			// HTTP edits run in the same fixture; reset resources and generated/build
			// state before the independently timed fresh production build.
			for (const locale of ["en", "de", "fr"])
				await fs.writeFile(
					path.join(directory, `messages/${locale}.json`),
					JSON.stringify(catalog[locale])
				);
			for (const target of [
				outdir,
				path.join(directory, ".svelte-kit"),
				path.join(directory, "dist"),
				path.join(directory, ".output"),
				path.join(directory, ".tanstack"),
				path.join(directory, ".vite-cache"),
				path.join(directory, "project.inlang/cache/paraglide-js"),
			])
				await fs.rm(target, { recursive: true, force: true });
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
			const production = await command(root, self, [
				"--http-worker",
				"--production",
				`--directory=${directory}`,
				`--framework=${framework}`,
			]);
			const productionHttp = JSON.parse(
				production.log.match(/BENCHMARK_RESULT (.*)/)[1]
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
					.filter((id) => id >= usedMessages)
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
				productionHttp,
				typecheckMs: checked.ms,
				pipelineMs: built.ms + checked.ms,
				output: await outputStats(outdir),
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
