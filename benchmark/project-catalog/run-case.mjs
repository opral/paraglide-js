import fs from "node:fs";
import inspector from "node:inspector";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
const root = path.resolve(
		process.env.CATALOG_BENCH_RESULTS ?? "catalog-benchmark-results"
	),
	workspace = path.resolve(new URL("./", import.meta.url).pathname, "../..");
if (
	!process.env.CATALOG_BENCH_BASELINE ||
	!process.env.CATALOG_BENCH_CANDIDATE ||
	!process.env.CATALOG_BENCH_PLUGIN
)
	throw Error(
		"Set CATALOG_BENCH_BASELINE, CATALOG_BENCH_CANDIDATE and CATALOG_BENCH_PLUGIN to absolute paths"
	);
fs.mkdirSync(root, { recursive: true });
const [
		backend = "catalog",
		layout = "message",
		sizeText = "6400",
		roundText = "0",
		mode = "full",
	] = process.argv.slice(2),
	size = Number(sizeText),
	round = Number(roundText),
	locales = ["en", "de", "fr"];
const fixture = path.join(
		root,
		"fixtures",
		`${backend}-${layout}-${size}-${round}-${mode}`
	),
	outdir = path.join(fixture, "out"),
	projectPath = path.join(fixture, "project.inlang");
fs.rmSync(fixture, { recursive: true, force: true });
for (const dir of ["messages", "project.inlang"])
	fs.mkdirSync(path.join(fixture, dir), { recursive: true });
fs.writeFileSync(path.join(fixture, "package.json"), '{"type":"module"}');
fs.copyFileSync(
	process.env.CATALOG_BENCH_PLUGIN ??
		path.join(
			workspace,
			"inlang-sdk-loading-profile/packages/plugins/inlang-message-format/dist/index.js"
		),
	path.join(fixture, "plugin.js")
);
for (const locale of locales)
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
fs.writeFileSync(
	path.join(projectPath, "settings.json"),
	JSON.stringify({
		baseLocale: "en",
		locales,
		modules: ["./plugin.js"],
		"plugin.inlang.messageFormat": { pathPattern: "./messages/{locale}.json" },
	})
);
for (const [name, content] of Object.entries({
	".meta.json": JSON.stringify({ highestSdkVersion: "4.0.4" }),
	"README.md": "readme",
	".gitignore": "ignore",
}))
	fs.writeFileSync(path.join(projectPath, name), content);
const repo =
	backend !== "sdk"
		? (process.env.CATALOG_BENCH_CANDIDATE ??
			path.join(workspace, "paraglide-project-catalog"))
		: (process.env.CATALOG_BENCH_BASELINE ??
			path.join(workspace, "paraglide-direct-declarations-pr"));
let importStart = performance.now();
const { compile } = await import(path.join(repo, "dist/compiler/compile.js"));
let sdk, compileCatalog, compileProject, writeOutput;
if (mode === "phases") {
	sdk = await import(path.join(repo, "node_modules/@inlang/sdk/dist/index.js"));
	({ compileCatalog, compileProject } = await import(
		path.join(repo, "dist/compiler/compile-project.js")
	));
	({ writeOutput } = await import(
		path.join(repo, "dist/services/file-handling/write-output.js")
	));
}
if (
	backend === "catalog" &&
	typeof (
		await import(path.join(repo, "node_modules/@inlang/sdk/dist/index.js"))
	).createCatalogLoader !== "function"
)
	throw Error("Candidate SDK does not expose createCatalogLoader");
const importMs = performance.now() - importStart,
	options = {
		project: projectPath,
		outdir,
		emitTsDeclarations: true,
		outputStructure:
			layout === "message" ? "message-modules" : "locale-modules",
		cleanOutdir: false,
		strategy: ["baseLocale"],
	},
	phases = {};
let profiler;
const post = (method, params = {}) =>
	new Promise((resolve, reject) => {
		profiler.post(method, params, (error, result) =>
			error ? reject(error) : resolve(result)
		);
	});
if (process.env.CATALOG_CPU_PROFILE) {
	profiler = new inspector.Session();
	profiler.connect();
	await post("Profiler.enable");
	await post("Profiler.setSamplingInterval", { interval: 1000 });
	await post("Profiler.start");
}
const start = performance.now();
if (mode === "full") await compile(options);
else {
	let t = performance.now(),
		project,
		catalog;
	if (backend === "catalog")
		catalog = await sdk.createCatalogLoader({ path: projectPath, fs }).load();
	else project = await sdk.loadProjectFromDirectory({ path: projectPath, fs });
	phases.load = performance.now() - t;
	if (project && compileCatalog) {
		t = performance.now();
		catalog = {
			settings: await project.settings.get(),
			bundles: await sdk.selectBundleNested(project.db).execute(),
		};
		phases.query = performance.now() - t;
	}
	phases.catalogReady = performance.now() - start;
	t = performance.now();
	const output = catalog
		? await compileCatalog({
				catalog,
				projectPath: "./project.inlang",
				compilerOptions: options,
			})
		: await compileProject({
				project,
				projectPath: "./project.inlang",
				compilerOptions: options,
			});
	phases.compile = performance.now() - t;
	t = performance.now();
	await writeOutput({
		directory: outdir,
		output,
		fs: fs.promises,
		cleanDirectory: false,
	});
	phases.write = performance.now() - t;
	t = performance.now();
	await project?.close();
	phases.close = performance.now() - t;
}
const totalMs = performance.now() - start;
if (profiler) {
	const { profile } = await post("Profiler.stop");
	profiler.disconnect();
	fs.writeFileSync(process.env.CATALOG_CPU_PROFILE, JSON.stringify(profile));
}
const files = fs
		.readdirSync(outdir, { recursive: true, withFileTypes: true })
		.filter((e) => e.isFile())
		.map((e) => path.relative(outdir, path.join(e.parentPath, e.name)))
		.sort(),
	hash = createHash("sha256");
let bytes = 0;
for (const file of files) {
	let content = fs.readFileSync(path.join(outdir, file), "utf8");
	bytes += Buffer.byteLength(content);
	if (file === "README.md")
		content = content.replaceAll(projectPath, "./project.inlang");
	hash.update(file).update(content);
}
let validated = 0;
if (round === 0 && mode === "full") {
	const { m } = await import(
		pathToFileURL(path.join(outdir, "messages.js")).href
	);
	for (const locale of locales)
		for (let i = 0; i < size; i++) {
			if (
				m[`message_${i}`]({ username: "Ada" }, { locale }) !==
				`${locale} Message ${i}: Hello Ada!`
			)
				throw Error("Runtime mismatch");
			validated++;
		}
}
const row = {
	backend,
	layout,
	size,
	round,
	mode,
	node: process.version,
	importMs,
	totalMs,
	coldWithImportMs: importMs + totalMs,
	phases,
	files: files.length,
	dts: files.filter((f) => f.endsWith(".d.ts")).length,
	bytes,
	hash: hash.digest("hex"),
	validated,
};
fs.appendFileSync(path.join(root, "results.jsonl"), JSON.stringify(row) + "\n");
console.log(JSON.stringify(row));
