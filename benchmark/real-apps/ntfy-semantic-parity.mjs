import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const webRoot = process.argv[2];
if (!webRoot) throw new Error("Usage: node ntfy-semantic-parity.mjs <ntfy-web-root> [output-json]");
const compilerRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const benchmarkRoot = path.resolve(process.env.NTFY_BENCHMARK_OUTPUT_ROOT ?? path.join(compilerRoot, ".real-apps/ntfy-ab"));
const mapping = JSON.parse(await fs.readFile(path.join(benchmarkRoot, "mapping.json"), "utf8"));
const localeFiles = (await fs.readdir(path.join(webRoot, "public/static/langs"))).filter((file) => file.endsWith(".json")).sort();
const toLocale = (file) => file.slice(0, -5).replaceAll("_", "-");
const catalogs = Object.fromEntries(await Promise.all(localeFiles.map(async (file) => [
	toLocale(file), JSON.parse(await fs.readFile(path.join(webRoot, "public/static/langs", file), "utf8")),
])));
const requireFromApp = createRequire(path.join(webRoot, "package.json"));
const i18nextModule = requireFromApp("i18next");
const i18next = i18nextModule.createInstance();
const resources = Object.fromEntries(Object.entries(catalogs).map(([locale, catalog]) => [locale, { translation: catalog }]));
await i18next.init({
	lng: "en",
	fallbackLng: "en",
	resources,
	interpolation: { escapeValue: false },
	initAsync: false,
});
const localStorageValues = new Map([["i18nextLng", "en"]]);
globalThis.window = { location: { href: "http://localhost/" } };
globalThis.localStorage = {
	getItem(key) { return localStorageValues.get(key) ?? null; },
	setItem(key, value) { localStorageValues.set(key, String(value)); },
};
const { transMessages } = await import(pathToFileURL(path.join(webRoot, "src/benchmark-adapter/trans-messages.js")).href);
const { default: i18nBridge } = await import(pathToFileURL(path.join(webRoot, "src/benchmark-adapter/i18next-bridge.js")).href);
const { callTranslation, prepareMessageInputs } = await import(pathToFileURL(path.join(webRoot, "src/benchmark-adapter/translation-inputs.js")).href);

const pluralSuffixes = new Set(["zero", "one", "two", "few", "many", "other"]);
const English = catalogs.en;
function serializeParts(parts) {
	return parts.map((part) => {
		if (part.type === "text") return part.value;
		if (part.type === "markup-start") return `<${part.name}>`;
		if (part.type === "markup-end") return `</${part.name}>`;
		if (part.type === "markup-standalone") return `<${part.name}/>`;
		return "";
	}).join("");
}
function formsFor(key) {
	return Object.keys(English).filter((candidate) => candidate.startsWith(`${key}_`) && pluralSuffixes.has(candidate.slice(key.length + 1)));
}
function inputsFor(key, count) {
	const candidateStrings = [English[key], ...formsFor(key).map((form) => English[form]), ...Object.values(catalogs).map((catalog) => catalog[key])]
		.filter((value) => typeof value === "string");
	const variables = new Set(candidateStrings.flatMap((text) => [...text.matchAll(/\{\{\s*([^{}]+?)\s*\}\}/g)].map((match) => match[1].trim())));
	const inputs = Object.fromEntries([...variables].map((name) => [name, name === "count" ? count : `sample_${name}`]));
	if (formsFor(key).length > 0) inputs.count = count;
	return inputs;
}

const mismatches = [];
let cases = 0;
let mismatchCount = 0;
for (const locale of Object.keys(catalogs).sort()) {
	await i18next.changeLanguage(locale);
	await i18nBridge.changeLanguage(locale);
	for (const key of Object.keys(mapping)) {
		const counts = formsFor(key).length > 0 ? [0, 1, 3, 5, 100] : [1];
		for (const count of counts) {
			const inputs = inputsFor(key, count);
			const expected = i18next.t(key, inputs);
			let actual;
			try {
				const message = transMessages[key];
				actual = typeof message.parts === "function"
					? serializeParts(message.parts(prepareMessageInputs(key, inputs)))
					: callTranslation(key, message, inputs);
			} catch (error) {
				actual = `THREW: ${error.message}`;
			}
			cases++;
			if (actual !== expected) {
				mismatchCount++;
				if (mismatches.length < 250) mismatches.push({ locale, key, count, inputs, expected, actual });
			}
		}
	}
}

await i18nBridge.changeLanguage("xx");
const unknownLocaleFallback = i18nBridge.t("prefs_appearance_date_format_title");

const react = requireFromApp("react");
const { renderToStaticMarkup } = requireFromApp("react-dom/server");
const { Trans } = await import(pathToFileURL(path.join(webRoot, "src/benchmark-adapter/react-i18next-bridge.js")).href);
const richHtml = renderToStaticMarkup(react.createElement(Trans, {
	i18nKey: "notifications_more_details",
	components: {
		websiteLink: react.createElement("a", { href: "https://ntfy.sh" }),
		docsLink: react.createElement("a", { href: "/docs" }),
	},
}));
const expectedRichHtml = 'For more information, check out the <a href="https://ntfy.sh">website</a> or <a href="/docs">documentation</a>.';

const report = {
	app: "ntfy",
	messageIdCount: Object.keys(mapping).length,
	localeCount: localeFiles.length,
	cases,
	mismatchCount,
	mismatches,
	unknownLocaleFallback,
	unknownLocaleFallbackPass: unknownLocaleFallback === "Date format",
	richHtml,
	richMarkupPass: richHtml === expectedRichHtml,
	pluralCounts: [0, 1, 3, 5, 100],
	verdict: mismatches.length === 0 && unknownLocaleFallback === "Date format" && richHtml === expectedRichHtml ? "full catalog semantics match" : "semantic differences found",
};
const output = path.resolve(process.argv[3] ?? path.join(benchmarkRoot, "semantic-parity.json"));
await fs.writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ verdict: report.verdict, cases, mismatchCount, mismatches: mismatches.slice(0, 20), unknownLocaleFallback, richMarkupPass: report.richMarkupPass }, null, 2));
