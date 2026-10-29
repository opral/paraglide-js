import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
const artifact = path.dirname(new URL(import.meta.url).pathname);
const [variant = "current", sizeText = "100", mode = "validate"] =
		process.argv.slice(2),
	size = Number(sizeText);
const p = path.resolve(
	process.env.CATALOG_BENCH_CANDIDATE ?? path.join(artifact, "../../..")
);
const resultsDir = path.resolve(process.env.CATALOG_BENCH_RESULTS ?? artifact);
fs.mkdirSync(resultsDir, { recursive: true });
const sdk = process.env.CATALOG_BENCH_SDK;
if (!sdk) throw Error("Set CATALOG_BENCH_SDK to the built SDK package");
const grai = process.env.CATALOG_BENCH_GRAI;
const root = fs.mkdtempSync(
	path.join(os.tmpdir(), "incremental-" + variant + "-")
);
const project = path.join(root, "project.inlang"),
	outdir = path.join(root, "out"),
	locales = ["en", "de", "fr"];
fs.mkdirSync(project);
fs.mkdirSync(path.join(root, "messages"));
fs.copyFileSync(
	process.env.CATALOG_BENCH_PLUGIN ??
		path.join(p, "node_modules/@inlang/plugin-message-format/dist/index.js"),
	path.join(root, "plugin.mjs")
);
const settings = {
	baseLocale: "en",
	locales,
	modules: ["./plugin.mjs"],
	"plugin.inlang.messageFormat": { pathPattern: "./messages/{locale}.json" },
};
fs.writeFileSync(path.join(project, "settings.json"), JSON.stringify(settings));
const catalogs = Object.fromEntries(
	locales.map((locale) => [
		locale,
		Object.fromEntries(
			Array.from({ length: size }, (_, i) => [
				"message_" + i,
				`${locale} Message ${i}: Hello {username}!`,
			])
		),
	])
);
function save(locale, pretty = false) {
	fs.writeFileSync(
		path.join(root, "messages", locale + ".json"),
		JSON.stringify(catalogs[locale], null, pretty ? 2 : undefined)
	);
}
locales.forEach((l) => save(l));
const config = path.join(root, "grai.json");
fs.writeFileSync(
	config,
	JSON.stringify({
		locales,
		baseLocale: "en",
		catalogs: "messages/{locale}.json",
		outdir: "out",
		strategy: [],
	})
);
let writes = 0,
	previous,
	extraOptions = {};
const rows = [];
const measuredFs = {
	...fs,
	promises: {
		...fs.promises,
		async writeFile(file, ...args) {
			if (path.resolve(String(file)).startsWith(outdir + path.sep)) writes++;
			return fs.promises.writeFile(file, ...args);
		},
	},
};
const entry =
	variant === "baseline"
		? path.join(
				process.env.CATALOG_BENCH_BASELINE ?? "",
				"dist/compiler/compile.js"
			)
		: variant === "grai"
			? path.join(grai, "dist/bench.js")
			: path.join(p, "dist/compiler/compile.js");
let compiler;
if (variant === "grai") {
	const bench = fs.readFileSync(entry, "utf8");
	const chunk = bench.match(
		/import \{ ([^}]*?as recompile[^}]*?) \} from \"([^\"]+)\"/
	);
	const exports = await import(
		pathToFileURL(path.resolve(path.dirname(entry), chunk[2])).href
	);
	const symbol = (name) =>
		chunk[1].match(new RegExp("(?:^|, )([a-zA-Z]+) as " + name + "(?:,|$)"))[1];
	compiler = {
		recompile: exports[symbol("recompile")],
		compile: exports[symbol("compile")],
	};
} else compiler = await import(pathToFileURL(entry).href);
async function run(scenario) {
	writes = 0;
	const start = performance.now();
	if (variant === "grai") {
		const next = await compiler.recompile(config, previous);
		assert.deepEqual(next.result.errors, []);
		previous = next.build;
		writes = next.result.written.length;
	} else {
		previous = await compiler.compile({
			project,
			outdir,
			fs: measuredFs,
			cleanOutdir: false,
			emitTsDeclarations: true,
			strategy: ["baseLocale"],
			...extraOptions,
			previousCompilation: previous,
		});
	}
	const row = {
		variant,
		size,
		scenario,
		ms: performance.now() - start,
		writes,
	};
	rows.push(row);
	if (mode === "validate") await verify(scenario);
}
function output(dir) {
	const map = {};
	function walk(relative = "") {
		for (const entry of fs.readdirSync(path.join(dir, relative), {
			withFileTypes: true,
		})) {
			const name = path.join(relative, entry.name);
			if (entry.isDirectory()) walk(name);
			else if (name.endsWith(".js") || name.endsWith(".d.ts"))
				map[name] = fs.readFileSync(path.join(dir, name), "utf8");
		}
	}
	walk();
	return map;
}
async function verify(scenario) {
	if (variant === "grai") {
		const oracle = path.join(root, "oracle"),
			oracleConfig = path.join(root, "grai-oracle.json");
		fs.rmSync(oracle, { recursive: true, force: true });
		fs.writeFileSync(
			oracleConfig,
			JSON.stringify({
				locales,
				baseLocale: "en",
				catalogs: "messages/{locale}.json",
				outdir: "oracle",
				strategy: [],
			})
		);
		const result = await compiler.compile(oracleConfig);
		assert.deepEqual(result.errors, []);
		const expected = output(oracle),
			actual = output(outdir);
		assert.deepEqual(
			Object.fromEntries(Object.keys(expected).map((n) => [n, actual[n]])),
			expected,
			scenario
		); /* Grai intentionally retains obsolete content-addressed modules. */
	} else {
		const { createCatalogLoader } = await import(
			pathToFileURL(path.join(sdk, "dist/project/createCatalogLoader.js")).href
		);
		const { compileCatalog } = await import(
			pathToFileURL(path.join(p, "dist/compiler/compile-project.js")).href
		);
		const catalog = await createCatalogLoader({
			path: project,
			fs,
			writePluginCache: false,
		}).load();
		const expected = await compileCatalog({
			catalog,
			projectPath: project,
			compilerOptions: {
				emitTsDeclarations: true,
				strategy: ["baseLocale"],
				...extraOptions,
			},
		});
		const relevant = Object.fromEntries(
			Object.entries(expected).filter(
				([n]) => n.endsWith(".js") || n.endsWith(".d.ts")
			)
		);
		const actual = output(outdir);
		assert.deepEqual(
			Object.keys(actual).sort(),
			Object.keys(relevant).sort(),
			scenario + " filenames"
		);
		for (const name of Object.keys(relevant))
			assert.equal(actual[name], relevant[name], scenario + " " + name);
	}
}
try {
	await run("initial");
	await run("noop");
	catalogs.de.message_0 = "DE edited: Hello {username}!";
	save("de");
	await run("translation");
	catalogs.fr["message_" + (size - 1)] = "FR edited: Hello {username}!";
	save("fr");
	await run("distant-translation");
	catalogs.de.message_1 = "DE extra: Hello {username} {extra}!";
	save("de");
	await run("input-change");
	for (const locale of locales) {
		catalogs[locale].added_key = `${locale} New {username}!`;
		save(locale);
	}
	await run("add-key");
	for (const locale of locales) {
		delete catalogs[locale].added_key;
		save(locale);
	}
	await run("delete-key");
	save("de", true);
	await run("format-only");
	if (mode === "validate" && variant !== "grai") {
		const plural = {
			declarations: ["input count", "local countPlural = count: plural"],
			selectors: ["countPlural"],
			match: {
				"countPlural=one": "One file",
				"countPlural=*": "{count} files",
			},
		};
		for (const locale of locales) {
			catalogs[locale].message_2 = [plural];
			catalogs[locale]["é_😀"] = "Hello {who}";
			save(locale);
		}
		await run("complex-plural-and-unicode");
		catalogs.de.message_2 = [
			{
				...plural,
				match: { ...plural.match, "countPlural=one": "One changed file" },
			},
		];
		save("de");
		await run("edit-plural");
		const before = output(outdir),
			oldPrevious = previous;
		fs.writeFileSync(path.join(root, "messages/de.json"), "{invalid");
		await assert.rejects(() => run("invalid-json"));
		assert.deepEqual(output(outdir), before);
		previous = oldPrevious;
		save("de");
		await run("recovery");
		settings.baseLocale = "de";
		fs.writeFileSync(
			path.join(project, "settings.json"),
			JSON.stringify(settings)
		);
		await run("settings-invalidation");
		extraOptions = { includeEslintDisableComment: false };
		await run("options-invalidation");
		fs.appendFileSync(path.join(root, "plugin.mjs"), "\n");
		await run("plugin-invalidation");
	} else if (mode !== "validate") await verify("final");
	fs.writeFileSync(
		path.join(resultsDir, `trial-${variant}-${size}-${process.pid}.json`),
		JSON.stringify(
			{ node: process.version, variant, size, verified: true, rows },
			null,
			2
		)
	);
	console.log(JSON.stringify({ variant, size, verified: true, rows }));
} finally {
	fs.rmSync(root, { recursive: true, force: true });
}
