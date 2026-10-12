import { mkdir, readFile, writeFile } from "node:fs/promises";
import { brotliCompressSync, constants, gzipSync } from "node:zlib";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDir, "../../..");
const scratchRoot =
	process.env.FACADESHAPE_SCRATCH_ROOT ??
	path.join(repositoryRoot, ".real-apps/facade-tree-shake");
const packageRoot =
	process.env.PARAGLIDE_SPLIT_PACKAGE_ROOT ??
	"/root/repos-iii/paraglide-client-split-pr4";
const pluginPath = path.join(
	packageRoot,
	"dist/bundler-plugins/client-locale-split/vite-plugin.js"
);
const pluginModule = await import(pathToFileURL(pluginPath).href);
const createClientLocaleSplitPlugin =
	pluginModule.createClientLocaleSplitPlugin;
const vitePaths = {
	"7.3.1": process.env.VITE7_NODE_ENTRY ?? "/root/repos-iii/paraglide-sdk-patch/node_modules/.pnpm/vite@7.3.1_@types+node@22.19.3_jiti@2.7.0_lightningcss@1.32.0_tsx@4.21.0_yaml@2.8.2/node_modules/vite/dist/node/index.js",
	"8.1.4": process.env.VITE8_NODE_ENTRY ?? path.join(packageRoot, "node_modules/vite/dist/node/index.js"),
};

const messageCount = 512;
const richName = "richMessage";
const names = Array.from({ length: messageCount - 1 }, (_, index) =>
	`message${String(index).padStart(4, "0")}`
);
names.push(richName);

const metadata = {
	baseLocale: "en",
	locales: ["en", "de"],
	messages: names.map((publicName, index) =>
		publicName === richName
			? {
					safeName: publicName,
					publicName,
					hasInputs: true,
					hasMarkup: true,
				}
			: {
					safeName: publicName,
					publicName,
					hasInputs: false,
					hasMarkup: false,
					staticTexts: {
						en: `English label ${index}: Open preferences and manage every notification setting in this workspace.`,
						de: `Deutsche Beschriftung ${index}: Öffnen Sie die Einstellungen für diesen Arbeitsbereich.`,
					},
				}
	),
};

async function writeProject(root, variant) {
	const outdir = path.join(root, "src/paraglide");
	await mkdir(path.join(outdir, "messages"), { recursive: true });
	await writeFile(path.join(root, "package.json"), '{"type":"module"}\n');
	await writeFile(
		path.join(root, "index.html"),
		'<!doctype html><html><head></head><body><script type="module" src="/src/main.js"></script></body></html>\n'
	);
	await writeFile(path.join(outdir, "messages.js"), "// intercepted generated entry\n");
	await writeFile(path.join(outdir, "locale-loader.js"), "// intercepted generated loader\n");
	await writeFile(path.join(outdir, "client-locale-split.json"), JSON.stringify(metadata));
	await writeFile(
		path.join(outdir, "runtime.js"),
		`export const baseLocale = "en";\nlet activeLocale = "en";\nlet setLocaleImpl = (locale) => { activeLocale = locale; };\nexport const getLocale = () => activeLocale;\nexport const setLocale = (locale, options) => setLocaleImpl(locale, options);\nexport const overwriteSetLocale = (next) => { setLocaleImpl = next; };\nexport const toLocale = (value) => typeof value === "string" ? ({ en: "en", de: "de" })[value.toLowerCase()] : undefined;\n`
	);
	const localeFiles = {};
	for (const locale of metadata.locales) {
		localeFiles[locale] = `export const ${richName} = Object.assign((inputs = {}) => ${JSON.stringify(locale === "en" ? "Hello " : "Hallo ")} + inputs.name, { parts: (inputs = {}) => [{ type: "text", value: ${JSON.stringify(locale === "en" ? "Hello " : "Hallo ")} }, { type: "element", name: "strong", children: [{ type: "text", value: inputs.name }] }] });\n`;
		await writeFile(path.join(outdir, "messages", `${locale}.js`), localeFiles[locale]);
	}
	await writeFile(
		path.join(root, "src/main.js"),
		variant === "full"
			? `import { m, message0000, richMessage } from "./paraglide/messages.js";\nconst allKeys = Object.keys(m);\nconst selectedKey = globalThis.__selectedMessageKey || "message0000";\nconst selectedRichKey = globalThis.__selectedRichMessageKey || "richMessage";\nglobalThis.__facadeProbe = { allKeys, count: allKeys.length, protoIsNull: Object.getPrototypeOf(m) === null, frozen: Object.isFrozen(m), tag: Object.prototype.toString.call(m), messageAlias: m.message0000 === message0000, richAlias: m.richMessage === richMessage, partsAlias: m.richMessage.parts === richMessage.parts, staticText: m[selectedKey](), richText: m[selectedRichKey]({ name: "Ada" }), parts: m[selectedRichKey].parts({ name: "Ada" }), messageDescriptor: (() => { const d = Object.getOwnPropertyDescriptor(m, "message0000"); return { enumerable: d.enumerable, writable: d.writable, configurable: d.configurable, isFunction: typeof d.value === "function" }; })(), richFunctionDescriptor: (() => { const d = Object.getOwnPropertyDescriptor(m, "richMessage"); return { enumerable: d.enumerable, writable: d.writable, configurable: d.configurable, isFunction: typeof d.value === "function" }; })(), partsDescriptor: (() => { const d = Object.getOwnPropertyDescriptor(m.richMessage, "parts"); return { enumerable: d.enumerable, writable: d.writable, configurable: d.configurable, isFunction: typeof d.value === "function" }; })(), tagDescriptor: (() => { const d = Object.getOwnPropertyDescriptor(m, Symbol.toStringTag); return { value: d.value, enumerable: d.enumerable, writable: d.writable, configurable: d.configurable }; })() };\n`
			: `import { message0000, richMessage } from "./paraglide/messages.js";\nglobalThis.__facadeProbe = { staticText: message0000(), richText: richMessage({ name: "Ada" }), parts: richMessage.parts({ name: "Ada" }) };\n`
	);
}

function makeNamespaceIifePlugin() {
	let transformed = false;
	return {
		name: "facade-namespace-iife-prototype",
		enforce: "post",
		transform(code, id) {
			if (!id.includes("paraglide:client-locale-split:root")) return null;
			const pattern = /const __paraglideMessages = Object\.create\(null\);\n([\s\S]*?)\nObject\.freeze\(__paraglideMessages\);/;
			if (!pattern.test(code)) {
				throw new Error(`Could not find facade namespace initializer in ${JSON.stringify(id)}`);
			}
			transformed = true;
			return code.replace(
				pattern,
				"const __paraglideMessages = /*#__PURE__*/ (() => {\nconst __paraglideMessages = Object.create(null);\n$1\nreturn Object.freeze(__paraglideMessages);\n})();"
			);
		},
		wasTransformed() {
			return transformed;
		},
	};
}

function makeStatsPlugin(record) {
	return {
		name: "facade-bundle-stats",
		generateBundle(_options, bundle) {
			for (const output of Object.values(bundle)) {
				if (output.type !== "chunk") continue;
				const facadeModule = Object.entries(output.modules).find(([id]) =>
					id.includes("paraglide:client-locale-split:root")
				);
				if (facadeModule) {
					const info = facadeModule[1];
					record.facadeChunks.push({
						fileName: output.fileName,
						isEntry: output.isEntry,
						moduleId: facadeModule[0],
						originalLength: info.originalLength,
						renderedLength: info.renderedLength,
						renderedExportCount: info.renderedExports?.length,
						removedExportCount: info.removedExports?.length,
					});
				}
			}
		},
	};
}

function compressionSizes(bytes) {
	return {
		bytes: bytes.length,
		gzip: gzipSync(bytes, { level: 9 }).length,
		brotli: brotliCompressSync(bytes, {
			params: { [constants.BROTLI_PARAM_QUALITY]: 11 },
		}).length,
	};
}

async function buildCase(viteVersion, facadeMode, consumerMode) {
	const label = `vite-${viteVersion}-${facadeMode}-${consumerMode}`;
	const root = path.join(scratchRoot, label);
	const outDir = path.join(root, "dist");
	await mkdir(root, { recursive: true });
	await writeProject(root, consumerMode);
	const viteModule = await import(pathToFileURL(vitePaths[viteVersion]).href);
	const record = { label, facadeChunks: [] };
	const state = { compilerOptions: { outdir: path.join(root, "src/paraglide") } };
	const splitPlugin = createClientLocaleSplitPlugin({ state });
	const namespaceIifePlugin = makeNamespaceIifePlugin();
	const plugins = [splitPlugin];
	if (facadeMode === "pure-iife") plugins.push(namespaceIifePlugin);
	plugins.push(makeStatsPlugin(record));
	await viteModule.build({
		configFile: false,
		logLevel: "silent",
		root,
		plugins,
		build: {
			target: "es2022",
			outDir,
			emptyOutDir: true,
			modulePreload: { polyfill: false },
		},
	});
	if (facadeMode === "pure-iife" && !namespaceIifePlugin.wasTransformed()) {
		throw new Error(`${label}: namespace IIFE prototype did not run`);
	}
	const jsFiles = [];
	for (const item of await (await import("node:fs/promises")).readdir(path.join(outDir, "assets"))) {
		if (!item.endsWith(".js")) continue;
		const file = path.join(outDir, "assets", item);
		const bytes = await readFile(file);
		jsFiles.push({ name: item, ...compressionSizes(bytes) });
	}
	const entryFile = jsFiles.find((item) => item.name.startsWith("index"));
	if (!entryFile) throw new Error(`${label}: no index JS entry found`);
	if (consumerMode === "named") {
		delete globalThis.__facadeProbe;
		await import(pathToFileURL(path.join(outDir, "assets", entryFile.name)).href);
		record.runtimeProbe = globalThis.__facadeProbe;
		delete globalThis.__facadeProbe;
	} else {
		globalThis.__selectedMessageKey = "message0510";
		globalThis.__selectedRichMessageKey = richName;
		delete globalThis.__facadeProbe;
		await import(pathToFileURL(path.join(outDir, "assets", entryFile.name)).href);
		record.runtimeProbe = globalThis.__facadeProbe;
		delete globalThis.__facadeProbe;
	}
	return {
		...record,
		messageCount,
		jsFiles,
		entry: entryFile,
		allJs: jsFiles.reduce(
			(acc, file) => ({
				bytes: acc.bytes + file.bytes,
				gzip: acc.gzip + file.gzip,
				brotli: acc.brotli + file.brotli,
			}),
			{ bytes: 0, gzip: 0, brotli: 0 }
		),
	};
}

const results = [];
for (const viteVersion of Object.keys(vitePaths)) {
	for (const consumerMode of ["named", "full"]) {
		for (const facadeMode of ["current", "pure-iife"]) {
			results.push(await buildCase(viteVersion, facadeMode, consumerMode));
		}
	}
}

for (const viteVersion of Object.keys(vitePaths)) {
	const byCase = new Map(results.filter((row) => row.label.includes(`vite-${viteVersion}-`)).map((row) => [row.label, row]));
	for (const consumerMode of ["named", "full"]) {
		const current = byCase.get(`vite-${viteVersion}-current-${consumerMode}`);
		const prototype = byCase.get(`vite-${viteVersion}-pure-iife-${consumerMode}`);
		if (JSON.stringify(current.runtimeProbe) !== JSON.stringify(prototype.runtimeProbe)) {
			throw new Error(`${viteVersion} ${consumerMode}: runtime API changed across facade shape`);
		}
		if (consumerMode === "full" && current.allJs.brotli !== prototype.allJs.brotli) {
			console.warn(`${viteVersion} full namespace Brotli differs: ${current.allJs.brotli} vs ${prototype.allJs.brotli}`);
		}
	}
}

const resultPath = path.join(scratchRoot, "results.json");
await writeFile(resultPath, JSON.stringify({
	fixture: { messages: messageCount, locales: metadata.locales, namedImports: ["message0000", richName], richPartsExercised: true },
	results,
}, null, 2));
console.log(JSON.stringify({ resultPath, results: results.map((row) => ({ label: row.label, entry: row.entry, allJs: row.allJs, facadeChunks: row.facadeChunks, probe: row.runtimeProbe })) }, null, 2));
