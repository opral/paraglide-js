import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import inspector from "node:inspector";

export function configuration() {
	const required = (name) => {
		const value = process.env[name];
		if (!value || !path.isAbsolute(value))
			throw new Error(`${name} must be an absolute path`);
		if (!fs.existsSync(value))
			throw new Error(`${name} does not exist: ${value}`);
		return value;
	};
	const baseline = required("CATALOG_BENCH_BASELINE");
	const candidate = required("CATALOG_BENCH_CANDIDATE");
	const plugin = required("CATALOG_BENCH_PLUGIN");
	const grai = required("CATALOG_BENCH_GRAI");
	const optimizedPlugin = process.env.CATALOG_BENCH_OPTIMIZED_PLUGIN
		? required("CATALOG_BENCH_OPTIMIZED_PLUGIN")
		: undefined;
	const results = process.env.CATALOG_BENCH_RESULTS;
	const rounds = Number(process.env.CATALOG_BENCH_ROUNDS ?? 3);
	if (!Number.isSafeInteger(rounds) || rounds < 1 || rounds % 2 !== 1)
		throw new Error("CATALOG_BENCH_ROUNDS must be a positive odd integer");
	if (!results || !path.isAbsolute(results))
		throw new Error(
			"CATALOG_BENCH_RESULTS must be an absolute output directory"
		);
	return {
		baseline,
		candidate,
		plugin,
		optimizedPlugin,
		grai,
		results,
		rounds,
	};
}

const importFile = (filename) => import(pathToFileURL(filename).href);
const checksum = (filename) =>
	createHash("sha256").update(fs.readFileSync(filename)).digest("hex");

export async function runCase(args = process.argv.slice(2)) {
	const entryProcessMs = process.uptime() * 1000;
	const config = configuration();
	const [
		backend = "catalog",
		layout = "default",
		sizeText = "6400",
		roundText = "0",
		mode = "full",
	] = args;
	if (!["sdk", "catalog", "catalog-optimized", "grai"].includes(backend))
		throw new Error(`Unknown backend: ${backend}`);
	if (!["default", "locale", "shards"].includes(layout))
		throw new Error(`Unknown layout: ${layout}`);
	if (!["full", "phases"].includes(mode))
		throw new Error(`Unknown mode: ${mode}`);
	if (backend === "grai" && (mode !== "full" || layout !== "shards"))
		throw new Error("Grai supports full/shards only in this runner");
	if (backend === "sdk" && layout === "shards")
		throw new Error(
			"Frozen baseline predates sharding; sdk/shards is not a valid comparison"
		);
	if (backend === "catalog-optimized" && !config.optimizedPlugin)
		throw new Error(
			"catalog-optimized requires CATALOG_BENCH_OPTIMIZED_PLUGIN"
		);
	const size = Number(sizeText),
		round = Number(roundText);
	if (
		!Number.isSafeInteger(size) ||
		size < 1 ||
		!Number.isSafeInteger(round) ||
		round < 0
	)
		throw new Error(
			"Size and round must be nonnegative safe integers; size must be positive"
		);
	const locales = ["en", "de", "fr"];
	const fixture = path.join(
		config.results,
		"fixtures",
		`${backend}-${layout}-${size}-${round}-${mode}`
	);
	if (fs.existsSync(fixture))
		throw new Error(
			`Trial already exists; use a fresh result directory or round: ${fixture}`
		);
	const outdir = path.join(fixture, "out"),
		projectPath = path.join(fixture, "project.inlang");
	fs.mkdirSync(path.join(fixture, "messages"), { recursive: true });
	fs.mkdirSync(projectPath);
	fs.writeFileSync(path.join(fixture, "package.json"), '{"type":"module"}');
	const plugin =
		backend === "catalog-optimized" ? config.optimizedPlugin : config.plugin;
	fs.copyFileSync(plugin, path.join(fixture, "plugin.js"));
	for (const locale of locales) {
		fs.writeFileSync(
			path.join(fixture, "messages", `${locale}.json`),
			JSON.stringify(
				Object.fromEntries(
					Array.from({ length: size }, (_, i) => [
						`message_${i}`,
						`${locale} Message ${i}: Hello {username}!`,
					])
				),
				null,
				"\t"
			) + "\n"
		);
	}
	fs.writeFileSync(
		path.join(projectPath, "settings.json"),
		JSON.stringify({
			baseLocale: "en",
			locales,
			modules: ["./plugin.js"],
			"plugin.inlang.messageFormat": {
				pathPattern: "./messages/{locale}.json",
			},
		})
	);
	for (const [name, value] of Object.entries({
		".meta.json": JSON.stringify({ highestSdkVersion: "4.0.4" }),
		"README.md": "readme",
		".gitignore": "ignore",
	}))
		fs.writeFileSync(path.join(projectPath, name), value);
	const repo = backend === "sdk" ? config.baseline : config.candidate;
	const compilePath =
		backend === "grai"
			? fs.statSync(config.grai).isDirectory()
				? path.join(config.grai, "dist/compile.js")
				: config.grai
			: path.join(repo, "dist/compiler/compile.js");
	const importStart = performance.now();
	const { compile } = await importFile(compilePath);
	let sdk, compileCatalog, compileProject, writeOutput;
	if (mode === "phases")
		sdk = await importFile(
			path.join(repo, "node_modules/@inlang/sdk/dist/index.js")
		);
	if (
		backend.startsWith("catalog") &&
		!fs.existsSync(
			path.join(
				repo,
				"node_modules/@inlang/sdk/dist/project/loadProjectCatalog.js"
			)
		)
	)
		throw new Error(
			"Candidate SDK does not expose loadProjectCatalog; refusing legacy fallback measurement"
		);
	if (mode === "phases") {
		({ compileCatalog, compileProject } = await importFile(
			path.join(repo, "dist/compiler/compile-project.js")
		));
		({ writeOutput } = await importFile(
			path.join(repo, "dist/services/file-handling/write-output.js")
		));
	}
	const importMs = performance.now() - importStart;
	const options = {
		project: projectPath,
		outdir,
		emitTsDeclarations: true,
		outputStructure: layout === "locale" ? "locale-modules" : "message-modules",
		cleanOutdir: false,
		strategy: ["baseLocale"],
		...(layout === "shards" ? { messageModuleSize: 512 } : {}),
	};
	const graiConfig = path.join(fixture, "grai.config.json");
	if (backend === "grai")
		fs.writeFileSync(
			graiConfig,
			JSON.stringify({
				locales,
				baseLocale: "en",
				catalogs: "messages/{locale}.json",
				outdir: "out",
				strategy: [],
			})
		);
	let session;
	const post = (method) =>
		new Promise((resolve, reject) =>
			session.post(method, (error, result) =>
				error ? reject(error) : resolve(result)
			)
		);
	const profilePath = process.env.CATALOG_CPU_PROFILE;
	if (profilePath) {
		if (!path.isAbsolute(profilePath))
			throw new Error("CATALOG_CPU_PROFILE must be an absolute filename");
		session = new inspector.Session();
		session.connect();
		await post("Profiler.enable");
		await post("Profiler.start");
	}
	const phases = {},
		start = performance.now();
	try {
		if (mode === "full") {
			if (backend === "grai") {
				const result = await compile(graiConfig);
				if (result.errors?.length)
					throw new Error(JSON.stringify(result.errors));
			} else await compile(options);
		} else {
			let clock = performance.now(),
				project,
				catalog;
			try {
				if (backend.startsWith("catalog"))
					catalog = await sdk.loadProjectCatalog({
						path: projectPath,
						fs,
						writePluginCache: true,
					});
				else
					project = await sdk.loadProjectFromDirectory({
						path: projectPath,
						fs,
					});
				phases.load = performance.now() - clock;
				if (catalog?.diagnostics?.length)
					throw new Error(catalog.diagnostics.map(String).join("\n"));
				if (project && compileCatalog) {
					clock = performance.now();
					catalog = {
						settings: await project.settings.get(),
						bundles: await sdk.selectBundleNested(project.db).execute(),
					};
					phases.query = performance.now() - clock;
				}
				phases.catalogReady = performance.now() - start;
				clock = performance.now();
				const output = catalog
					? await compileCatalog({
							catalog,
							projectPath,
							compilerOptions: options,
						})
					: await compileProject({
							project,
							projectPath,
							compilerOptions: options,
						});
				phases.compile = performance.now() - clock;
				clock = performance.now();
				await writeOutput({
					directory: outdir,
					output,
					fs: fs.promises,
					cleanDirectory: false,
				});
				phases.write = performance.now() - clock;
			} finally {
				const clock = performance.now();
				await project?.close();
				phases.close = performance.now() - clock;
			}
		}
	} finally {
		// Capture compile duration before Profiler.stop and before verification IO.
		phases.total = performance.now() - start;
		if (session) {
			const { profile } = await post("Profiler.stop");
			session.disconnect();
			fs.mkdirSync(path.dirname(profilePath), { recursive: true });
			fs.writeFileSync(profilePath, JSON.stringify(profile));
		}
	}
	const files = fs
		.readdirSync(outdir, { recursive: true, withFileTypes: true })
		.filter((entry) => entry.isFile())
		.map((entry) =>
			path.relative(outdir, path.join(entry.parentPath, entry.name))
		)
		.sort();
	const hash = createHash("sha256");
	let bytes = 0;
	for (const filename of files) {
		let content = fs.readFileSync(path.join(outdir, filename), "utf8");
		bytes += Buffer.byteLength(content);
		if (filename === "README.md")
			content = content.replaceAll(projectPath, "./project.inlang");
		hash.update(filename).update("\0").update(content).update("\0");
	}
	const messageFiles = files.filter(
		(name) =>
			name.startsWith(`messages${path.sep}`) &&
			name.endsWith(".js") &&
			!name.endsWith(`${path.sep}_index.js`)
	);
	if (backend !== "grai") {
		const expected =
			layout === "default"
				? size
				: layout === "locale"
					? locales.length
					: Math.ceil(size / 512);
		if (messageFiles.length !== expected)
			throw new Error(
				`Wrong generated layout: expected ${expected} message JS files, got ${messageFiles.length}`
			);
	}
	let validated = 0;
	if (round === 0 && mode === "full") {
		const { m } = await importFile(path.join(outdir, "messages.js"));
		for (const locale of locales)
			for (let i = 0; i < size; i++) {
				if (
					m[`message_${i}`]({ username: "Ada" }, { locale }) !==
					`${locale} Message ${i}: Hello Ada!`
				)
					throw new Error(`Runtime mismatch: ${backend}/${locale}/${i}`);
				validated++;
			}
	}
	const row = {
		backend,
		layout,
		size,
		round,
		mode,
		entryProcessMs,
		diagnosticProfile: Boolean(profilePath),
		node: process.version,
		repo: backend === "grai" ? config.grai : repo,
		plugin: backend === "grai" ? null : plugin,
		pluginSha256: backend === "grai" ? null : checksum(plugin),
		compilePath,
		importMs,
		totalMs: phases.total,
		coldWithImportMs: importMs + phases.total,
		phases: mode === "phases" ? phases : {},
		files: files.length,
		js: files.filter((name) => name.endsWith(".js")).length,
		dts: files.filter((name) => name.endsWith(".d.ts")).length,
		maps: files.filter((name) => name.endsWith(".map")).length,
		bytes,
		hash: hash.digest("hex"),
		validated,
	};
	fs.appendFileSync(
		path.join(config.results, "results.jsonl"),
		JSON.stringify(row) + "\n"
	);
	console.log(JSON.stringify(row));
	return row;
}

if (
	process.argv[1] &&
	import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
)
	await runCase();
