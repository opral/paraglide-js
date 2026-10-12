import { readFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import path from "node:path";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDir, "../../..");
const scratch = process.env.FACADESHAPE_SCRATCH_ROOT ?? path.join(repositoryRoot, ".real-apps/facade-tree-shake");
const packageRoot = process.env.PARAGLIDE_SPLIT_PACKAGE_ROOT ?? "/root/repos-iii/paraglide-client-split-pr4";
const pluginModule = await import(
	pathToFileURL(
		path.join(
			packageRoot,
			"dist/bundler-plugins/client-locale-split/vite-plugin.js"
		)
	).href
);
const metadataPath = path.join(
	scratch,
	"vite-7.3.1-current-full/src/paraglide/client-locale-split.json"
);
const metadata = JSON.parse(await readFile(metadataPath, "utf8"));
const outdir = path.dirname(metadataPath);
const plugin = pluginModule.createClientLocaleSplitPlugin({
	state: { compilerOptions: { outdir } },
});
const rootId = "\0paraglide:client-locale-split:root";
const code = await plugin.load.call({}, rootId);
if (typeof code !== "string") throw new Error("Root facade source did not load");

function localeArraySource(locale) {
	return metadata.messages
		.map((message) => {
			const staticText = message.staticTexts?.[locale];
			if (staticText !== undefined) return JSON.stringify(staticText);
			const greeting = JSON.stringify(locale === "en" ? "Hello " : "Hallo ");
			return `Object.assign((inputs = {}) => ${greeting} + inputs.name, { parts: (inputs = {}) => [{ type: "text", value: ${greeting} }, { type: "element", name: "strong", children: [{ type: "text", value: inputs.name }] }] })`;
		})
		.join(",");
}

const coreCode = `const locales = { en: [${localeArraySource("en")}], de: [${localeArraySource("de")}] };\nexport const selectedMessageLocale = (locale) => locale ?? "en";\nexport const requireLoadedLocale = (locale) => locales[locale];\nexport const startupLocalePromise = Promise.resolve();\n`;
const coreDataUrl = `data:text/javascript;base64,${Buffer.from(coreCode).toString("base64")}`;
const withCore = code.replaceAll(
	'"virtual:paraglide/client-locale-split/core"',
	JSON.stringify(coreDataUrl)
);

function makeVariant(source, pure) {
	if (!pure) return source;
	const pattern = /const __paraglideMessages = Object\.create\(null\);\n([\s\S]*?)\nObject\.freeze\(__paraglideMessages\);/;
	if (!pattern.test(source)) throw new Error("Could not find namespace initializer");
	return source.replace(
		pattern,
		"const __paraglideMessages = /*#__PURE__*/ (() => {\nconst __paraglideMessages = Object.create(null);\n$1\nreturn Object.freeze(__paraglideMessages);\n})();"
	);
}

const snapshots = [];
for (const pure of [false, true]) {
	const transformed = makeVariant(withCore, pure);
	const module = await import(
		`data:text/javascript;base64,${Buffer.from(`${transformed}\n`).toString("base64")}`
	);
	const namespace = module.m;
	const messageDescriptor = Object.getOwnPropertyDescriptor(namespace, "message0000");
	const richDescriptor = Object.getOwnPropertyDescriptor(namespace, "richMessage");
	const partsDescriptor = Object.getOwnPropertyDescriptor(namespace.richMessage, "parts");
	snapshots.push({
		pure,
		count: Object.keys(namespace).length,
		keysDigest: createHash("sha256").update(Object.keys(namespace).join("\n")).digest("hex"),
		protoIsNull: Object.getPrototypeOf(namespace) === null,
		frozen: Object.isFrozen(namespace),
		moduleTag: Object.prototype.toString.call(namespace),
		messageValue: namespace.message0000(),
	richValue: namespace.richMessage({ name: "Ada" }),
		parts: namespace.richMessage.parts({ name: "Ada" }),
		descriptors: {
			message: { enumerable: messageDescriptor.enumerable, writable: messageDescriptor.writable, configurable: messageDescriptor.configurable },
			rich: { enumerable: richDescriptor.enumerable, writable: richDescriptor.writable, configurable: richDescriptor.configurable },
			parts: { enumerable: partsDescriptor.enumerable, writable: partsDescriptor.writable, configurable: partsDescriptor.configurable },
			tag: (() => { const d = Object.getOwnPropertyDescriptor(namespace, Symbol.toStringTag); return { value: d.value, enumerable: d.enumerable, writable: d.writable, configurable: d.configurable }; })(),
		},
		aliases: namespace.message0000 === module.message0000 && namespace.richMessage === module.richMessage,
	});
}
const comparableSnapshots = snapshots.map(({ pure: _pure, ...snapshot }) => snapshot);
if (JSON.stringify(comparableSnapshots[0]) === JSON.stringify(comparableSnapshots[1])) {
	console.log(JSON.stringify(snapshots, null, 2));
} else {
	console.error(JSON.stringify(snapshots, null, 2));
	throw new Error("Namespace API changed across IIFE prototype");
}
