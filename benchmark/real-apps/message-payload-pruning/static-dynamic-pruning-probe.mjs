import { mkdir, readFile, writeFile } from "node:fs/promises";
import { brotliCompressSync, constants, gzipSync } from "node:zlib";
import { pathToFileURL } from "node:url";
import path from "node:path";

const root = path.resolve(process.env.PRUNING_OUTPUT_DIR ?? path.resolve(process.cwd(), ".real-apps/message-payload-pruning/synthetic-output"));
const messageCount = 512;
const names = Array.from({ length: messageCount }, (_, i) => `message${String(i).padStart(4, "0")}`);
const locales = ["en", "de"];
const versions = {
	"7.3.1": process.env.VITE7_NODE_ENTRY,
	"8.1.4": process.env.VITE8_NODE_ENTRY,
};
for (const [version, entry] of Object.entries(versions)) if (!entry) throw new Error(`Set VITE${version.split(".")[0]}_NODE_ENTRY to the Vite ${version} dist/node/index.js file.`);

const literal = (locale, i) => `${locale.toUpperCase()} catalog text ${i}: a longer message intended to make retained payload differences measurable.`;

async function writeCase(name, mode, consumer) {
	const project = path.join(root, name);
	const outdir = path.join(project, "dist");
	const generated = path.join(project, "src/paraglide");
	await mkdir(path.join(generated, "messages"), { recursive: true });
	await writeFile(path.join(project, "package.json"), '{"type":"module"}\n');
	await writeFile(path.join(project, "index.html"), '<!doctype html><html><head></head><body><script type="module" src="/src/main.js"></script></body></html>\n');

	for (const locale of locales) {
		const values = names.map((_, i) => JSON.stringify(literal(locale, i)));
		const file = mode === "array"
			? `export default [${values.join(",")}];\n`
			: names.map((name, i) => `export const ${name} = ${values[i]};`).join("\n") + "\n";
		await writeFile(path.join(generated, `messages/${locale}.js`), file);
	}

	const runtime = mode === "array"
		? `const loaded = new Map();\nconst locales = ${JSON.stringify(locales)};\nconst loadOne = (locale) => (locale === "en" ? import("./messages/en.js") : locale === "de" ? import("./messages/de.js") : Promise.reject(new Error("locale"))).then((module) => { loaded.set(locale, module.default); });\nexport const loadLocale = (locale) => loadOne(locale);\n${names.map((name, i) => `export const get_${name} = (locale) => loaded.get(locale)?.[${i}];`).join("\n")}\nexport const startupLocalePromise = Promise.all([loadOne("en"), loadOne("de")]);\n`
		: `const locales = ${JSON.stringify(locales)};\n${locales.map((locale) => names.map((name) => `let ${locale}_${name};`).join("\n")).join("\n")}\nconst loadOne = (locale) => (locale === "en" ? import("./messages/en.js") : locale === "de" ? import("./messages/de.js") : Promise.reject(new Error("locale"))).then((module) => {\n${names.map((name) => `if (locale === "en") en_${name} = module.${name}; else de_${name} = module.${name};`).join("\n")}\n});\nexport const loadLocale = (locale) => loadOne(locale);\n${names.map((name) => `export const get_${name} = (locale) => locale === "en" ? en_${name} : de_${name};`).join("\n")}\nexport const startupLocalePromise = Promise.all([loadOne("en"), loadOne("de")]);\n`;
	await writeFile(path.join(generated, "runtime.js"), runtime);

	const imports = names.map((name) => `get_${name}`).join(", ");
	const declarations = names.map((name) => `const ${name} = () => get_${name}(globalThis.__locale || "en");`).join("\n");
	const namespace = `const m = /*#__PURE__*/ (() => { const value = Object.create(null);\n${names.map((name) => `value.${name} = ${name};`).join("\n")}\nreturn Object.freeze(value); })();\nexport { m };\n`;
	const exports = names.map((name) => `export { ${name} };`).join("\n");
	await writeFile(path.join(generated, "messages.js"), `import { ${imports}, startupLocalePromise } from "./runtime.js";\nawait startupLocalePromise;\n${declarations}\n${exports}\n${namespace}`);
	const main = consumer === "namespace"
		? `import { m } from "./paraglide/messages.js";\nglobalThis.__probe = { count: Object.keys(m).length, selected: m.message0510() };\n`
		: `import { message0000 } from "./paraglide/messages.js";\nglobalThis.__probe = { selected: message0000() };\n`;
	await writeFile(path.join(project, "src/main.js"), main);
	return { project, outdir };
}

function sizes(bytes) {
	return { raw: bytes.length, gzip: gzipSync(bytes, { level: 9 }).length, br: brotliCompressSync(bytes, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }).length };
}

const results = [];
for (const [version, entry] of Object.entries(versions)) {
	const vite = await import(pathToFileURL(entry).href);
	for (const mode of ["array", "named-values"]) {
		for (const consumer of ["named", "namespace"]) {
			const label = `vite-${version}-${mode}-${consumer}`;
			const { project, outdir } = await writeCase(label, mode, consumer);
			await vite.build({ configFile: false, logLevel: "silent", root: project, plugins: [], build: { target: "es2022", outDir: outdir, emptyOutDir: true, modulePreload: { polyfill: false } } });
			const assetsDir = path.join(outdir, "assets");
			const files = [];
			for (const filename of await (await import("node:fs/promises")).readdir(assetsDir)) {
				if (!filename.endsWith(".js")) continue;
				const bytes = await readFile(path.join(assetsDir, filename));
				files.push({ filename, ...sizes(bytes) });
			}
			const entryChunk = files.find((file) => file.filename.startsWith("index"));
			if (!entryChunk) throw new Error(`No entry chunk for ${label}`);
			delete globalThis.__probe;
			await import(pathToFileURL(path.join(assetsDir, entryChunk.filename)).href);
			const probe = globalThis.__probe;
			delete globalThis.__probe;
			if (consumer === "namespace" && (probe.count !== messageCount || probe.selected !== literal("en", 510))) throw new Error(`${label} namespace output mismatch`);
			if (consumer === "named" && probe.selected !== literal("en", 0)) throw new Error(`${label} named output mismatch`);
			results.push({ label, files, total: files.reduce((acc, file) => ({ raw: acc.raw + file.raw, gzip: acc.gzip + file.gzip, br: acc.br + file.br }), { raw: 0, gzip: 0, br: 0 }), probe });
		}
	}
}
const resultsPath = path.join(root, "results.json");
await writeFile(resultsPath, JSON.stringify({ messageCount, locales, results }, null, 2));
console.log(JSON.stringify({ resultsPath, results }, null, 2));
