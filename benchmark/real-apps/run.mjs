import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { gzipSync, brotliCompressSync } from "node:zlib";
import { performance } from "node:perf_hooks";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";

// Usage: node benchmark/real-apps/run.mjs <app> <checkout> <label> [compiler dist]
const [app, checkout, label, compiler = "dist"] = process.argv.slice(2);
if (!["drawdb", "memos", "anything-llm"].includes(app) || !checkout || !label)
	throw Error("Expected app, checkout, label, optional compiler dist");
const viteModulePath =
	app === "anything-llm"
		? path.resolve(checkout, "frontend/node_modules/vite/dist/node/index.js")
		: app === "memos"
			? path.resolve(checkout, "web/node_modules/vite/dist/node/index.js")
		: path.resolve("node_modules/vite/dist/node/index.js");
const { build } = await import(pathToFileURL(viteModulePath).href);
const i18nextPath =
	app !== "memos"
		? path.resolve(
				checkout,
				app === "anything-llm"
					? "frontend/node_modules/i18next/dist/esm/i18next.js"
					: "node_modules/i18next/dist/esm/i18next.js"
			)
		: path.resolve(
				".real-apps/deps-memos/node_modules/i18next/dist/esm/i18next.js"
			);
const { default: i18next } = await import(pathToFileURL(i18nextPath).href);
const i18nextVersion = JSON.parse(
	await fs.readFile(path.resolve(i18nextPath, "../../../package.json"), "utf8")
).version;
const sourceCommit = execFileSync("git", ["rev-parse", "HEAD"], {
	cwd: checkout,
	encoding: "utf8",
}).trim();
const load = (file) => import(pathToFileURL(path.resolve(compiler, file)).href);
const { compileBundle, compileBundleForVite } = await load(
	"compiler/compile-bundle.js"
);
const outputStructure =
	process.env.PARAGLIDE_OUTPUT_STRUCTURE ?? "message-modules";
if (!["message-modules", "locale-modules"].includes(outputStructure)) {
	throw Error(`Unknown output structure: ${outputStructure}`);
}
const output = await load(`compiler/output-structure/${outputStructure}.js`);
const packerPath = path.resolve(
	compiler,
	`bundler-plugins/${outputStructure === "message-modules" ? "dispatch-matrix-packer" : "locale-function-packer"}.js`
);
const packer = (await fs.stat(packerPath).catch(() => null))
	? await load(
			`bundler-plugins/${outputStructure === "message-modules" ? "dispatch-matrix-packer" : "locale-function-packer"}.js`
		)
	: undefined;
const { createRuntimeFile } = await load("compiler/runtime/create-runtime.js");
const { defaultCompilerOptions } = await load("compiler/compiler-options.js");
const { createRegistry } = await load("compiler/registry.js");
const folder = path.join(
	checkout,
	app === "drawdb" ? "src/i18n/locales" : "web/src/locales"
);
const catalogs = {};
const originalCatalogs = {};
const flatten = (obj, prefix = "", result = {}) => {
	for (const [key, value] of Object.entries(obj)) {
		const full = prefix ? `${prefix}.${key}` : key;
		if (typeof value === "string") {
			if (Object.hasOwn(result, full))
				throw Error(`Ambiguous catalog path ${full}`);
			result[full] = value;
		} else if (value && !Array.isArray(value) && typeof value === "object")
			flatten(value, full, result);
		else throw Error(`Unsupported catalog value ${full}`);
	}
	return result;
};
if (app === "anything-llm") {
	const { resources } = await import(
		pathToFileURL(path.join(checkout, "frontend/src/locales/resources.js")).href
	);
	for (const [locale, namespaces] of Object.entries(resources)) {
		originalCatalogs[locale] = namespaces.common;
		catalogs[locale] = flatten(namespaces.common);
	}
}
for (const filename of app === "anything-llm"
	? []
	: (await fs.readdir(folder)).sort()) {
	if (app === "drawdb" && filename.endsWith(".js")) {
		const module = await import(
			pathToFileURL(path.join(folder, filename)).href
		);
		const resource = Object.values(module).find((x) => x?.translation);
		if (resource) {
			const locale =
				{ "pt-br": "pt-BR", "zh-tw": "zh-TW", "pa-pk": "pa-PK", "sv-se": "sv" }[
					filename.slice(0, -3)
				] ?? filename.slice(0, -3);
			originalCatalogs[locale] = resource.translation;
			catalogs[locale] = flatten(resource.translation);
		}
	} else if (app === "memos" && filename.endsWith(".json")) {
		const locale = filename.slice(0, -5);
		originalCatalogs[locale] = JSON.parse(
			await fs.readFile(path.join(folder, filename), "utf8")
		);
		catalogs[locale] = flatten(originalCatalogs[locale]);
	}
}
const locales = Object.keys(catalogs);
const keys = [
	...new Set(Object.values(catalogs).flatMap((x) => Object.keys(x))),
].sort();
const mapping = Object.fromEntries(keys.map((key, i) => [key, `k${i}`]));
const excluded = [];
const bundles = [];
for (const key of keys) {
	const values = locales
		.map((locale) => catalogs[locale][key])
		.filter((x) => x !== undefined);
	// Fail closed on syntax this bounded adapter cannot represent. Never silently compare altered translations.
	if (
		values.some((x) => /\$t\(|\{\{[^}]*[,\-][^}]*\}\}/.test(x)) ||
		(/_(zero|one|two|few|many|other)$/.test(key) &&
			values.some((x) => /\{\{\s*count\s*\}\}/.test(x)))
	) {
		excluded.push(key);
		continue;
	}
	const names = [
		...new Set(
			values.flatMap((x) =>
				[...x.matchAll(/\{\{\s*([^{}]+?)\s*\}\}/g)].map((m) => m[1])
			)
		),
	];
	const pattern = (text) => {
		const parts = [];
		let offset = 0;
		for (const m of text.matchAll(/\{\{\s*([^{}]+?)\s*\}\}/g)) {
			if (m.index > offset)
				parts.push({ type: "text", value: text.slice(offset, m.index) });
			parts.push({
				type: "expression",
				arg: { type: "variable-reference", name: m[1] },
			});
			offset = m.index + m[0].length;
		}
		if (offset < text.length || !parts.length)
			parts.push({ type: "text", value: text.slice(offset) });
		return parts;
	};
	bundles.push({
		id: mapping[key],
		declarations: names.map((name) => ({ type: "input-variable", name })),
		messages: locales
			.filter((locale) => catalogs[locale][key] !== undefined)
			.map((locale) => ({
				id: `${mapping[key]}-${locale}`,
				bundleId: mapping[key],
				locale,
				selectors: [],
				variants: [
					{ id: "v", matches: [], pattern: pattern(catalogs[locale][key]) },
				],
			})),
	});
}
if (app === "drawdb" && excluded.length)
	throw Error(
		`Whole-app drawDB adapter cannot exclude ${JSON.stringify(excluded)}`
	);
const catalogHash = createHash("sha256")
	.update(JSON.stringify(catalogs))
	.digest("hex");
const compilerHash = createHash("sha256");
for (const filename of (
	await fs.readdir(path.resolve(compiler), { recursive: true })
).sort()) {
	if (filename.endsWith(".js"))
		compilerHash
			.update(filename)
			.update(await fs.readFile(path.resolve(compiler, filename)));
}
const compilerArtifactHash = compilerHash.digest("hex");
const included = keys.filter((key) => !excluded.includes(key));
const settings = { baseLocale: "en", locales };
// drawDB falls back directly to English. Memos catalog-only experiment uses the same bounded policy.
const fallbackMap = Object.fromEntries(
	locales.map((locale) => [locale, locale === "en" ? undefined : "en"])
);
const localeFunctionLocalNames =
	packer && output.createLocaleFunctionLocalNames
		? new Map(
				locales.map((locale) => [
					locale,
					output.createLocaleFunctionLocalNames(bundles, locale),
				])
			)
		: undefined;
const bundleCompiler =
	outputStructure === "message-modules" && packer
		? compileBundleForVite
		: compileBundle;
const compiled = bundles.map((bundle) =>
	bundleCompiler({
		bundle,
		fallbackMap,
		settings,
		inlineMessages: outputStructure === "message-modules",
		viteLocaleDispatch:
			outputStructure === "message-modules" && Boolean(packer),
		messageReferenceExpression: output.messageReferenceExpression,
	})
);
const root = path.resolve(".real-apps", app, label);
const generated = path.join(root, "paraglide");
const files = {
	...output.generateOutput(
		compiled,
		settings,
		fallbackMap,
		false,
		localeFunctionLocalNames
	),
	"runtime.js": createRuntimeFile({
		...settings,
		compilerOptions: {
			...defaultCompilerOptions,
			strategy: ["globalVariable", "baseLocale"],
		},
	}),
	"registry.js": createRegistry(),
	"messages.js": "export * from './messages/_index.js'",
	"package.json": '{"type":"module"}',
};
for (const [filename, code] of Object.entries(files)) {
	await fs.mkdir(path.dirname(path.join(generated, filename)), {
		recursive: true,
	});
	await fs.writeFile(path.join(generated, filename), code);
}
await fs.writeFile(path.join(root, "mapping.json"), JSON.stringify(mapping));
await fs.writeFile(path.join(root, "catalogs.json"), JSON.stringify(catalogs));
const messages = await import(
	pathToFileURL(path.join(generated, "messages.js")).href
);
const runtime = await import(
	pathToFileURL(path.join(generated, "runtime.js")).href
);
const inputs = Object.fromEntries(
	bundles.flatMap((b) => b.declarations.map((d) => [d.name, "sample"]))
);
await fs.writeFile(path.join(root, "inputs.json"), JSON.stringify(inputs));
// Keep the native resource hierarchy and source property order. Flattening
// keys is only needed for the compiler adapter, not for the i18next payload.
const includedSet = new Set(included);
const nativeCatalog = (resource, prefix = "") =>
	Object.fromEntries(
		Object.entries(resource).flatMap(([key, value]) => {
			const full = prefix ? `${prefix}.${key}` : key;
			if (typeof value === "string")
				return includedSet.has(full) ? [[key, value]] : [];
			const child = nativeCatalog(value, full);
			return Object.keys(child).length ? [[key, child]] : [];
		})
	);
const nativeNamespace = app === "anything-llm" ? "common" : "translation";
const nativeResources = Object.fromEntries(
	locales.map((locale) => [
		locale,
		{ [nativeNamespace]: nativeCatalog(originalCatalogs[locale]) },
	])
);
const nativeResourceHash = createHash("sha256")
	.update(JSON.stringify(nativeResources))
	.digest("hex");
const instance = i18next.createInstance();
await instance.init({
	lng: "en",
	fallbackLng: "en",
	initImmediate: false,
	lowerCaseLng: app === "anything-llm",
	defaultNS: nativeNamespace,
	interpolation: { escapeValue: false },
	resources: nativeResources,
});
let parityChecks = 0;
for (const locale of locales)
	for (const key of included) {
		const expected = instance.t(key, { ...inputs, lng: locale });
		const actual = messages[mapping[key]](inputs, { locale });
		if (expected !== actual)
			throw Error(
				`Parity mismatch ${locale}/${key}: ${JSON.stringify(expected)} != ${JSON.stringify(actual)}`
			);
		parityChecks++;
	}
let switchChecks = 0;
for (const locale of [
	...new Set([
		"en",
		"de",
		locales.at(-1),
		...locales.filter((x) => x.includes("-")),
	]),
]) {
	if (!locales.includes(locale)) continue;
	runtime.setLocale(locale, { reload: false });
	await instance.changeLanguage(locale);
	if (runtime.getLocale() !== locale)
		throw Error(`Selected locale differs: ${locale}`);
	for (const key of included) {
		if (messages[mapping[key]](inputs) !== instance.t(key, inputs))
			throw Error(`Switch parity mismatch ${locale}/${key}`);
		switchChecks++;
	}
}
const namespace = Object.fromEntries(
	included.map((key) => [key, mapping[key]])
);
const pEntry = `import * as m from './paraglide/messages.js'; import {setLocale} from './paraglide/runtime.js'; const map=${JSON.stringify(namespace)}; export {setLocale}; export const translate=(key,inputs)=>m[map[key]](inputs);`;
await fs.writeFile(path.join(root, "paraglide-entry.js"), pEntry);
await fs.writeFile(
	path.join(root, "i18next-entry.js"),
	`import i18next from ${JSON.stringify(i18nextPath)}; const resources=${JSON.stringify(nativeResources)}; await i18next.init({lng:'en',fallbackLng:'en',initImmediate:false,${app === "anything-llm" ? 'lowerCaseLng:true,defaultNS:"common",' : ""}interpolation:{escapeValue:false},resources}); export const translate=(key,inputs)=>i18next.t(key,inputs); export const setLocale=locale=>i18next.changeLanguage(locale);`
);
const sizes = {};
const packingChunks = [];
const bundledParityChecks = {};
for (const library of ["paraglide", "i18next"]) {
	const result = await build({
		configFile: false,
		logLevel: "error",
		plugins:
			library === "paraglide" && packer
				? [
						{
							name: "real-app-paraglide-locale-packer",
							enforce: "post",
							renderChunk: {
								order: "pre",
								handler(code, chunk) {
									const started = performance.now();
									const packed = (
										packer.packDispatchMatrixChunk ??
										packer.packLocaleFunctionChunk
									)(code, {
										fileName: chunk.fileName,
									});
									packingChunks.push({
										fileName: chunk.fileName,
										inputBytes: Buffer.byteLength(code),
										changed: Boolean(packed),
										milliseconds: performance.now() - started,
									});
									return packed;
								},
							},
						},
					]
				: [],
		build: {
			write: false,
			minify: true,
			target: "esnext",
			rollupOptions: {
				input: path.join(root, `${library}-entry.js`),
				preserveEntrySignatures: "strict",
				output: { format: "es", inlineDynamicImports: true },
			},
		},
	});
	const chunks = (Array.isArray(result) ? result : [result])
		.flatMap((x) => x.output)
		.filter((x) => x.type === "chunk");
	sizes[library] = {
		raw: chunks.reduce((n, c) => n + Buffer.byteLength(c.code), 0),
		gzip: chunks.reduce((n, c) => n + gzipSync(c.code).length, 0),
		brotli: chunks.reduce((n, c) => n + brotliCompressSync(c.code).length, 0),
	};
	await fs.writeFile(
		path.join(root, `${library}-bundle.js`),
		chunks.map((c) => c.code).join("\n")
	);
	const built = await import(
		pathToFileURL(path.join(root, `${library}-bundle.js`)).href
	);
	bundledParityChecks[library] = 0;
	for (const locale of locales) {
		await built.setLocale(locale, { reload: false });
		await instance.changeLanguage(locale);
		for (const key of included) {
			if (built.translate(key, inputs) !== instance.t(key, inputs))
				throw Error(`Vite bundle parity mismatch ${library}/${locale}/${key}`);
			bundledParityChecks[library]++;
		}
	}
}
const median = (a) => a.sort((a, b) => a - b)[Math.floor(a.length / 2)];
const rounds = { paraglide: [], i18next: [] };
let checksum = 0;
const sample = included.slice(0, 100);
for (let round = 0; round < 11; round++)
	for (const library of round % 2
		? ["i18next", "paraglide"]
		: ["paraglide", "i18next"]) {
		const fn =
			library === "paraglide"
				? (key) => messages[mapping[key]](inputs)
				: (key) => instance.t(key, inputs);
		const locale = locales[locales.length - 1];
		runtime.setLocale(locale, { reload: false });
		await instance.changeLanguage(locale);
		const start = performance.now();
		for (let i = 0; i < 10000; i++)
			checksum += fn(sample[i % sample.length]).length;
		if (round > 1)
			rounds[library].push(((performance.now() - start) / 10000) * 1000);
	}
const report = {
	app,
	label,
	outputStructure,
	checkout,
	sourceCommit,
	i18nextVersion,
	compiler,
	node: process.version,
	viteVersion: JSON.parse(
		await fs.readFile(
			path.resolve(viteModulePath, "../../../package.json"),
			"utf8"
		)
	).version,
	locales: locales.length,
	keys: keys.length,
	included: included.length,
	excluded,
	parityChecks,
	bundledParityChecks,
	localeFunctionPacking:
		outputStructure === "locale-modules" && Boolean(packer),
	dispatchMatrixPacking:
		outputStructure === "message-modules" && Boolean(packer),
	packingChunks,
	switchChecks,
	catalogHash,
	nativeResourceHash,
	nativeResourceStructure:
		"source hierarchy and property order; excluded keys removed on both sides",
	compilerArtifactHash,
	scope:
		app === "anything-llm"
			? "isolated catalog JS with app-native Vite; six plural keys excluded; string parity does not validate React Trans"
			: "complete-catalog isolated JS; Memos is an all-locales stress workload, not its lazy production loading",
	sizes,
	microsecondsPerTranslation: Object.fromEntries(
		Object.entries(rounds).map(([k, v]) => [k, median(v)])
	),
	rounds,
	checksum,
};
await fs.writeFile(
	path.join(root, "results.json"),
	JSON.stringify(report, null, 2)
);
console.log(JSON.stringify(report, null, 2));
