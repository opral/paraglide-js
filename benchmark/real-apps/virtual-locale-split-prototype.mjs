import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { gzipSync, brotliCompressSync } from "node:zlib";

const viteModulePath = path.resolve("node_modules/vite/dist/node/index.js");
const { build, version: viteVersion } = await import(
	pathToFileURL(viteModulePath).href
);

const [artifactRoot, selectedLocale = "en"] = process.argv.slice(2);
if (!artifactRoot) {
	throw new Error(
		"Usage: node benchmark/real-apps/virtual-locale-split-prototype.mjs <real-app artifact directory> [locale]"
	);
}

const generated = path.resolve(artifactRoot, "paraglide");
const indexPath = path.join(generated, "messages/_index.js");
const originalIndex = await fs.readFile(indexPath, "utf8");
const runtimePath = path.join(generated, "runtime.js");
const locales = [...originalIndex.matchAll(/^import \* as (\w+) from "\.\/([^"/]+)\.js"$/gm)].map(
	([, binding, locale]) => ({ binding, locale })
);
if (!locales.length || !locales.some(({ locale }) => locale === selectedLocale)) {
	throw new Error(`Selected locale ${selectedLocale} is not in ${indexPath}`);
}
const exports = [...originalIndex.matchAll(/^export const (\w+) =/gm)].map(([, name]) => name);
const exportMetadata = new Map(
	exports.map((name) => {
		const start = originalIndex.indexOf(`export const ${name} =`);
		const next = originalIndex.indexOf("\nexport const ", start + 1);
		const body = originalIndex.slice(start, next < 0 ? undefined : next);
		return [name, { parts: /\n\s*parts:/.test(body) }];
	})
);
const rootId = "\0paraglide:virtual-root";
const variantPrefix = "\0paraglide:virtual-locale:";
const namespace = "virtual:paraglide/split-messages";
let ssrBypassCount = 0;

const plugin = {
	name: "benchmark-virtual-locale-split",
	resolveId(source, importer, options) {
		if (source === namespace) return rootId;
		if (
			importer &&
			path.resolve(importer) === path.join(generated, "messages.js") &&
			source === "./messages/_index.js"
		) {
			if (options?.ssr) {
				ssrBypassCount++;
				return null;
			}
			return rootId;
		}
		if (source.startsWith("virtual:paraglide/split-messages/")) {
			const locale = decodeURIComponent(
				source.slice("virtual:paraglide/split-messages/".length)
			);
			if (locales.some((item) => item.locale === locale)) {
				return `${variantPrefix}${locale}`;
			}
		}
	},
	load(id) {
		if (id === rootId) {
			const dynamicImports = locales
				.map(
					({ locale }) =>
						`locale === ${JSON.stringify(locale)} ? import(${JSON.stringify(`${namespace}/${encodeURIComponent(locale)}`)}) : `
				)
				.join("");
			const fallback = `Promise.reject(new Error(\`Unsupported Paraglide locale: \${locale}\`))`;
			const wrappers = exports
				.map((name) => {
					const parts = exportMetadata.get(name)?.parts
						? `\n${name}.parts = (...args) => { const locale = args[1]?.locale ?? getLocale(); const message = requireLoadedLocale(locale).${name}; return message.parts ? message.parts(...args) : [{ type: "text", value: message(...args) }]; };`
						: "";
					return `export const ${name} = (...args) => requireLoadedLocale(args[1]?.locale ?? getLocale()).${name}(...args);${parts}`;
				})
				.join("\n");
			return `
import { getLocale } from ${JSON.stringify(pathToFileURL(runtimePath).href)};
const locales = ${JSON.stringify(locales.map(({ locale }) => locale))};
const loadedLocales = new Map();
const loadingLocales = new Map();
export async function loadLocale(locale) {
	if (!locales.includes(locale)) throw new Error(\`Unsupported Paraglide locale: \${locale}\`);
	if (loadedLocales.has(locale)) return;
	let loading = loadingLocales.get(locale);
	if (!loading) {
		loading = (${dynamicImports}${fallback})
			.then((messages) => { loadedLocales.set(locale, messages); loadingLocales.delete(locale); })
			.catch((error) => { loadingLocales.delete(locale); throw error; });
		loadingLocales.set(locale, loading);
	}
	await loading;
}
function requireLoadedLocale(locale) {
	const loaded = loadedLocales.get(locale);
	if (!loaded) {
		throw new Error(\`Paraglide locale \"\${locale}\" is not loaded. Await loadLocale(\"\${locale}\") before calling its synchronous messages.\`);
	}
	return loaded;
}
await loadLocale(getLocale());
${wrappers}
`;
		}
		if (id.startsWith(variantPrefix)) {
			const locale = id.slice(variantPrefix.length);
			const selected = locales.find((item) => item.locale === locale);
			if (!selected) throw new Error(`Unknown locale virtual module ${locale}`);
			let code = originalIndex.replace(
				/^import \* as \w+ from "\.\/[^"/]+\.js"\s*;?\s*$/gm,
				""
			);
			for (const { binding } of locales) {
				code = code.replace(new RegExp(`\\b${binding}\\b`, "g"), "__selected");
			}
			code = code.replace(
				/const locale = experimentalStaticLocale \?\? options\.locale \?\? getLocale\(\)/g,
				`const locale = ${JSON.stringify(locale)}`
			);
			code = code.replace(
				'from "../runtime.js"',
				`from ${JSON.stringify(pathToFileURL(runtimePath).href)}`
			);
			if (code.includes("options.locale ?? getLocale()")) {
				throw new Error("Generated locale dispatch shape changed; refusing an incomplete specialization");
			}
			return `import * as __selected from ${JSON.stringify(pathToFileURL(path.join(generated, "messages", `${selected.locale}.js`)).href)};\n${code}`;
		}
	},
};

	const entry = path.join(path.dirname(path.resolve(artifactRoot)), "virtual-locale-entry.js");
await fs.writeFile(
	entry,
	`import * as messages from ${JSON.stringify(namespace)};\n` +
		`import { getLocale, setLocale } from ${JSON.stringify(pathToFileURL(runtimePath).href)};\n` +
		`const keys = ${JSON.stringify(exports)};\n` +
		`export { getLocale, setLocale, keys };\n` +
		`export const loadLocale = messages.loadLocale;\n` +
		`export const translate = (key, ...args) => messages[key](...args);\n` +
		`export const sample = () => keys.map((key) => messages[key]()).join("");\n`
);

const result = await build({
	configFile: false,
	logLevel: "error",
	plugins: [plugin],
	build: {
		write: false,
		minify: true,
		target: "esnext",
		modulePreload: { polyfill: false },
		rollupOptions: {
			input: entry,
			preserveEntrySignatures: "strict",
			output: { format: "es", entryFileNames: "entry-[hash].js", chunkFileNames: "chunk-[hash].js" },
		},
	},
});
const chunks = (Array.isArray(result) ? result : [result]).flatMap((item) => item.output).filter((item) => item.type === "chunk");
const variantByLocale = new Map();
for (const chunk of chunks) {
	for (const moduleId of Object.keys(chunk.modules)) {
		if (moduleId.startsWith(variantPrefix)) {
			variantByLocale.set(moduleId.slice(variantPrefix.length), chunk.fileName);
		}
	}
}
const byFile = new Map(chunks.map((chunk) => [chunk.fileName, chunk]));
const entryChunk = chunks.find((chunk) => chunk.isEntry);
if (!entryChunk) throw new Error("Vite did not emit an entry chunk");
const selectedFiles = new Set();
const visitStatic = (fileName) => {
	if (selectedFiles.has(fileName)) return;
	selectedFiles.add(fileName);
	for (const imported of byFile.get(fileName)?.imports ?? []) visitStatic(imported);
};
visitStatic(entryChunk.fileName);
const selectedVariantFile = variantByLocale.get(selectedLocale);
if (!selectedVariantFile) throw new Error(`No emitted locale chunk for ${selectedLocale}`);
visitStatic(selectedVariantFile);
const files = [...selectedFiles].map((fileName) => {
	const chunk = byFile.get(fileName);
	return {
		fileName,
		bytes: Buffer.byteLength(chunk.code),
		gzip: gzipSync(chunk.code).length,
		brotli: brotliCompressSync(chunk.code).length,
		entry: chunk.isEntry,
		staticImports: chunk.imports,
		dynamicImports: chunk.dynamicImports,
	};
});
const total = (property) => files.reduce((sum, file) => sum + file[property], 0);

const buildDirectory = path.join(path.resolve(artifactRoot), `virtual-locale-split-build-${selectedLocale}`);
await fs.rm(buildDirectory, { recursive: true, force: true });
await fs.mkdir(buildDirectory, { recursive: true });
await fs.writeFile(path.join(buildDirectory, "package.json"), '{"type":"module"}');
for (const chunk of chunks) {
	await fs.writeFile(path.join(buildDirectory, chunk.fileName), chunk.code);
}
globalThis.__PARAGLIDE_START_LOCALE__ = selectedLocale;
globalThis.Event ??= class Event {
	constructor(type) { this.type = type; }
};
globalThis.window ??= { dispatchEvent: () => true };
globalThis.document ??= {
	createElement: () => ({
		relList: { supports: () => true },
		setAttribute() {},
		addEventListener() {},
	}),
	getElementsByTagName: () => [],
	querySelector: () => null,
	head: { appendChild() {} },
};
const candidate = await import(
	`${pathToFileURL(path.join(buildDirectory, entryChunk.fileName)).href}?run=${Date.now()}`
);
const baseline = await import(
	`${pathToFileURL(path.join(generated, "messages.js")).href}?run=${Date.now()}`
);
const mapping = JSON.parse(await fs.readFile(path.join(artifactRoot, "mapping.json"), "utf8"));
const inputs = JSON.parse(await fs.readFile(path.join(artifactRoot, "inputs.json"), "utf8"));
const exportedNames = new Set(exports);
let parityChecks = 0;
for (const key of Object.keys(mapping)) {
	if (!exportedNames.has(mapping[key])) continue;
	const expected = baseline[mapping[key]](inputs, { locale: selectedLocale });
	const actual = candidate.translate(mapping[key], inputs);
	if (expected !== actual) {
		throw new Error(`Virtual locale parity failed for ${selectedLocale}/${key}: ${JSON.stringify(expected)} != ${JSON.stringify(actual)}`);
	}
	parityChecks++;
}
const firstLocaleDifference = Object.keys(mapping).find((key) => {
	if (!exportedNames.has(mapping[key])) return false;
	const current = baseline[mapping[key]](inputs, { locale: selectedLocale });
	const alternate = locales.find(({ locale }) => locale !== selectedLocale)?.locale;
	return alternate && current !== baseline[mapping[key]](inputs, { locale: alternate });
});
let explicitLocaleMismatch;
if (firstLocaleDifference) {
	const alternate = locales.find(({ locale }) => locale !== selectedLocale)?.locale;
	let beforePreloadError;
	try {
		candidate.translate(mapping[firstLocaleDifference], inputs, { locale: alternate });
	} catch (error) {
		beforePreloadError = error.message;
	}
	await candidate.loadLocale(alternate);
	explicitLocaleMismatch = {
		message: mapping[firstLocaleDifference],
		selectedLocale,
		requestedLocale: alternate,
		baseline: baseline[mapping[firstLocaleDifference]](inputs, { locale: alternate }),
		virtual: candidate.translate(mapping[firstLocaleDifference], inputs, { locale: alternate }),
		beforePreloadError,
	};
}
const selectedBeforeSamePageSwitch = candidate.translate(exports[0], inputs);
const nextLocale = locales.find(({ locale }) => locale !== selectedLocale)?.locale;
await candidate.loadLocale(nextLocale);
candidate.setLocale(nextLocale, { reload: false });
const localeAfterSamePageSwitch = candidate.getLocale();
const selectedAfterSamePageSwitch = candidate.translate(exports[0], inputs);
const report = {
	selectedLocale,
	locales: locales.length,
	messageExports: exports.length,
	viteVersion,
	parityChecks,
	semantics: {
		explicitLocaleMismatch,
		samePageSwitch: {
			localeAfterSetLocaleReloadFalse: localeAfterSamePageSwitch,
			messageBefore: selectedBeforeSamePageSwitch,
			messageAfter: selectedAfterSamePageSwitch,
			expectedAfter: baseline[exports[0]](inputs, { locale: nextLocale }),
		},
	},
	allEmittedJsFiles: chunks.length,
	allEmittedRawBytes: chunks.reduce((sum, chunk) => sum + Buffer.byteLength(chunk.code), 0),
	selectedRequestGraph: {
		requests: files.length,
		raw: total("bytes"),
		gzip: total("gzip"),
		brotli: total("brotli"),
		files,
	},
	chunks: chunks.map((chunk) => ({
		fileName: chunk.fileName,
		modules: Object.keys(chunk.modules).filter((moduleId) => moduleId.startsWith(variantPrefix)),
		bytes: Buffer.byteLength(chunk.code),
		gzip: gzipSync(chunk.code).length,
		imports: chunk.imports,
		dynamicImports: chunk.dynamicImports,
	})),
};
await fs.writeFile(`${entry}.results.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
