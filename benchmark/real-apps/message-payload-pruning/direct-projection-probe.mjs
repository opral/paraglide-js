import { mkdir, readFile, writeFile } from "node:fs/promises";
import { brotliCompressSync, constants, gzipSync } from "node:zlib";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { deepStrictEqual } from "node:assert";

const root = path.resolve(process.env.PRUNING_OUTPUT_DIR ?? path.resolve(process.cwd(), ".real-apps/message-payload-pruning/projection-output"));
const messagesDir = process.env.NTFY_MESSAGES_DIR;
if (!messagesDir) throw new Error("Set NTFY_MESSAGES_DIR to the pinned Ntfy project.inlang/messages directory.");
const settingsPath = process.env.NTFY_SETTINGS_PATH ?? path.join(path.dirname(messagesDir), "settings.json");
const sourceCommit = process.env.NTFY_SOURCE_COMMIT ?? "211ba22860d7483073a8ce13dcda5f467194989b";
const shapes = (process.env.PROBE_SHAPES ?? "static-member,then-static-member,group-projection,namespace-escape,literal-static-member,literal-then-static-member,literal-group-projection,literal-namespace-escape").split(",");
const selectedVersions = (process.env.PROBE_VERSIONS ?? "7.3.1,8.1.4,8.3.4").split(",");
const preserveEntrySignatures = process.env.PRESERVE_ENTRY_SIGNATURES;
const settings = JSON.parse(await readFile(settingsPath, "utf8"));
const baseLocale = settings.baseLocale;
const locales = settings.locales;
const localeTexts = Object.fromEntries(await Promise.all(locales.map(async (locale) => {
	return [locale, JSON.parse(await readFile(path.join(messagesDir, `${locale}.json`), "utf8"))];
})));
const ids = Object.keys(localeTexts[baseLocale]);
if (ids.length !== 473 || locales.length !== 51 || locales.some((locale) => Object.keys(localeTexts[locale]).length !== ids.length) || new Set(ids).size !== ids.length) {
	throw new Error("Unexpected Ntfy catalog shape; expected the pinned 473-message/51-locale fixture.");
}
const localeFileName = (locale) => `locale-${Buffer.from(locale).toString("hex")}.js`;
const vitePaths = {
	"7.3.1": process.env.VITE7_NODE_ENTRY,
	"8.1.4": process.env.VITE81_NODE_ENTRY,
	"8.3.4": process.env.VITE83_NODE_ENTRY,
};
for (const version of selectedVersions) {
	if (!vitePaths[version]) throw new Error(`Set the Vite ${version} environment variable in the probe README to its dist/node/index.js file.`);
}

const compress = (bytes) => ({
	raw: bytes.length,
	gzip: gzipSync(bytes, { level: 9 }).length,
	br: brotliCompressSync(bytes, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }).length,
});

async function build(vite, version, shape) {
	const name = `vite-${version}-${shape}`;
	const project = path.join(root, name);
	const out = path.join(project, "dist");
	const source = path.join(project, "src");
	const messages = path.join(source, "messages");
	await mkdir(messages, { recursive: true });
	await writeFile(path.join(project, "package.json"), '{"type":"module"}\n');
	await writeFile(path.join(project, "index.html"), '<!doctype html><html><head></head><body><script type="module" src="/src/main.js"></script></body></html>\n');
	for (const locale of locales) {
		const exports = ids.map((id) => `export const ${id} = ${JSON.stringify(localeTexts[locale][id] ?? localeTexts[baseLocale][id])};`).join("\n");
		await writeFile(path.join(messages, localeFileName(locale)), `${exports}\n`);
	}
	const selector = `const load = (locale) => (${locales.map((locale) => `locale === ${JSON.stringify(locale)} ? import(${JSON.stringify(`./messages/${localeFileName(locale)}`)}) : `).join("")}Promise.reject(new Error("locale")));\n`;
	const literalImport = (locale) => `import(${JSON.stringify(`./messages/${localeFileName(locale)}`)})`;
	let main;
	if (shape === "static-member") {
		main = `${selector}const base = await load(${JSON.stringify(baseLocale)});\nconst namespace = await load("fr");\nglobalThis.__projection = [base.${ids[0]}, namespace.${ids[0]}];\n`;
	} else if (shape === "then-static-member") {
		main = `${selector}const base = await load(${JSON.stringify(baseLocale)});\nconst selected = await load("fr").then((namespace) => namespace.${ids[0]});\nglobalThis.__projection = [base.${ids[0]}, selected];\n`;
	} else if (shape === "namespace-escape") {
		main = `${selector}const base = await load(${JSON.stringify(baseLocale)});\nconst namespace = await load("fr");\nglobalThis.__projection = [Object.keys(base).length, Object.keys(namespace).length];\n`;
	} else if (shape === "group-projection") {
		const keys = ids.slice(0, 32);
		main = `${selector}const base = await load(${JSON.stringify(baseLocale)});\nconst namespace = await load("fr");\nglobalThis.__projection = [${keys.map((key) => `base.${key}, namespace.${key}`).join(", ")}];\n`;
	} else if (shape === "literal-static-member") {
		main = `const base = await ${literalImport(baseLocale)};\nconst namespace = await ${literalImport("fr")};\nglobalThis.__projection = [base.${ids[0]}, namespace.${ids[0]}];\n`;
	} else if (shape === "literal-then-static-member") {
		main = `const base = await ${literalImport(baseLocale)}.then((namespace) => namespace.${ids[0]});\nconst selected = await ${literalImport("fr")}.then((namespace) => namespace.${ids[0]});\nglobalThis.__projection = [base, selected];\n`;
	} else if (shape === "literal-group-projection") {
		const keys = ids.slice(0, 32);
		main = `const base = await ${literalImport(baseLocale)}.then((namespace) => [${keys.map((key) => `namespace.${key}`).join(", ")}]);\nconst selected = await ${literalImport("fr")}.then((namespace) => [${keys.map((key) => `namespace.${key}`).join(", ")}]);\nglobalThis.__projection = [base, selected];\n`;
	} else if (shape === "literal-namespace-escape") {
		main = `const base = await ${literalImport(baseLocale)};\nconst namespace = await ${literalImport("fr")};\nglobalThis.__projection = [Object.keys(base).length, Object.keys(namespace).length];\n`;
	} else {
		throw new Error(shape);
	}
	await writeFile(path.join(source, "main.js"), main);
	const emittedModuleChunks = [];
	const emittedChunks = [];
	const outputStatsPlugin = {
		name: "capture-generated-locale-chunks",
		generateBundle(_options, bundle) {
			for (const output of Object.values(bundle)) {
				if (output.type !== "chunk") continue;
				emittedChunks.push({ file: output.fileName, isEntry: output.isEntry, imports: output.imports, dynamicImports: output.dynamicImports });
				for (const moduleId of Object.keys(output.modules)) {
					const locale = locales.find((item) => moduleId.endsWith(`/messages/${localeFileName(item)}`));
					if (locale) emittedModuleChunks.push({ locale, file: output.fileName, renderedExportCount: output.modules[moduleId].renderedExports?.length });
				}
			}
		},
	};
	await vite.build({ configFile: false, logLevel: "silent", root: project, plugins: [outputStatsPlugin], build: { target: "es2022", outDir: out, emptyOutDir: true, modulePreload: { polyfill: false }, ...(preserveEntrySignatures === undefined ? {} : { rollupOptions: { output: { preserveEntrySignatures } } }) } });
	const assetDir = path.join(out, "assets");
	const chunks = [];
	for (const file of await (await import("node:fs/promises")).readdir(assetDir)) {
		if (!file.endsWith(".js")) continue;
		const bytes = await readFile(path.join(assetDir, file));
		chunks.push({ file, ...compress(bytes), content: bytes.toString("utf8") });
	}
	const entry = chunks.find((chunk) => chunk.file.startsWith("index"));
	delete globalThis.__projection;
	await import(pathToFileURL(path.join(assetDir, entry.file)).href);
	const projection = globalThis.__projection;
	delete globalThis.__projection;
	const firstId = ids[0];
	const first32 = ids.slice(0, 32);
	const expectedProjection = shape.includes("namespace-escape")
		? [ids.length, ids.length]
		: shape === "group-projection"
			? first32.flatMap((id) => [localeTexts[baseLocale][id], localeTexts.fr[id] ?? localeTexts[baseLocale][id]])
			: shape === "literal-group-projection"
				? [
					first32.map((id) => localeTexts[baseLocale][id]),
					first32.map((id) => localeTexts.fr[id] ?? localeTexts[baseLocale][id]),
				]
				: [localeTexts[baseLocale][firstId], localeTexts.fr[firstId] ?? localeTexts[baseLocale][firstId]];
	deepStrictEqual(projection, expectedProjection, `${name} must preserve the source message values`);
	const fileByName = new Map(chunks.map((chunk) => [chunk.file, chunk]));
	const localeChunks = emittedModuleChunks.map(({ locale, file }) => {
		const chunk = fileByName.get(path.basename(file));
		const textSet = new Set(ids.map((id) => localeTexts[locale][id] ?? localeTexts[baseLocale][id]));
		return { locale, file, raw: chunk?.raw, gzip: chunk?.gzip, br: chunk?.br, distinctTexts: textSet.size };
	});
	const selectedLocales = [baseLocale, "fr"];
	const selectedFiles = new Set(emittedModuleChunks.filter(({ locale }) => selectedLocales.includes(locale)).map(({ file }) => file));
	const entryChunk = emittedChunks.find((chunk) => chunk.isEntry);
	if (entryChunk) selectedFiles.add(entryChunk.file);
	const chunkByName = new Map(emittedChunks.map((chunk) => [chunk.file, chunk]));
	const addStaticImports = (file) => {
		for (const imported of chunkByName.get(file)?.imports ?? []) {
			if (selectedFiles.has(imported)) continue;
			selectedFiles.add(imported);
			addStaticImports(imported);
		}
	};
	for (const file of [...selectedFiles]) addStaticImports(file);
	const initialRouteFiles = [...selectedFiles].map((file) => fileByName.get(path.basename(file))).filter(Boolean);
	const initialRoute = initialRouteFiles.reduce((all, chunk) => ({ raw: all.raw + chunk.raw, gzip: all.gzip + chunk.gzip, br: all.br + chunk.br }), { raw: 0, gzip: 0, br: 0 });
	return { name, projection, initialRouteFiles: initialRouteFiles.map(({ file, raw, gzip, br }) => ({ file, raw, gzip, br })), initialRoute, localeChunks: localeChunks.filter((item) => [baseLocale, "fr"].includes(item.locale)), messageExportCounts: emittedModuleChunks.filter(({ locale }) => [baseLocale, "fr"].includes(locale)).map(({ locale, renderedExportCount }) => ({ locale, count: renderedExportCount })), total: chunks.reduce((all, chunk) => ({ raw: all.raw + chunk.raw, gzip: all.gzip + chunk.gzip, br: all.br + chunk.br }), { raw: 0, gzip: 0, br: 0 }) };
}

const results = [];
for (const [version, entry] of Object.entries(vitePaths).filter(([version]) => selectedVersions.includes(version))) {
	const vite = await import(pathToFileURL(entry).href);
	for (const shape of shapes) results.push(await build(vite, version, shape));
}
const output = path.join(root, "results.json");
await writeFile(output, JSON.stringify({ source: { dataset: "Ntfy project.inlang catalog", messageCount: ids.length, localeCount: locales.length, baseLocale, sourceCommit }, config: { preserveEntrySignatures: preserveEntrySignatures ?? "vite-default" }, results }, null, 2));
console.log(JSON.stringify({ output, source: { messageCount: ids.length, localeCount: locales.length, baseLocale }, config: { preserveEntrySignatures: preserveEntrySignatures ?? "vite-default" }, results: results.map(({ name, messageExportCounts, initialRoute, total }) => ({ name, messageExportCounts, initialRoute, total })) }, null, 2));
