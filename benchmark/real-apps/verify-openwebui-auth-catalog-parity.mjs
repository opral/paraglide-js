#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const appRoot = path.resolve(process.env.OPENWEBUI_CANDIDATE ?? path.join(repoRoot, ".real-apps/openwebui-paraglide-ab"));
const compiledOutdir = path.resolve(process.env.OPENWEBUI_PARAGLIDE_OUTDIR ?? path.join(appRoot, "src/lib/paraglide-auth"));
const sourceRoot = path.resolve(process.env.OPENWEBUI_SOURCE ?? path.join(repoRoot, ".real-apps/open-webui-source"));
const outputFile = path.resolve(process.env.OPENWEBUI_CATALOG_PARITY_OUTPUT ?? path.join(repoRoot, "benchmark/real-apps/results/openwebui-auth-catalog-parity.json"));
const readJson = async (file) => JSON.parse(await fs.readFile(file, "utf8"));

const adapterSource = await fs.readFile(path.join(appRoot, "src/lib/i18n/paraglide-auth.ts"), "utf8");
const mappingSource = adapterSource.match(/const keyToId = (\{[\s\S]*?\}) as const;/)?.[1];
if (!mappingSource) throw new Error("Could not recover the auth key mapping from the candidate adapter");
const keyToId = JSON.parse(mappingSource);
const keys = Object.keys(keyToId);
const locales = (await fs.readdir(path.join(sourceRoot, "src/lib/i18n/locales"), { withFileTypes: true }))
	.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
if (keys.length !== 106 || locales.length !== 64) throw new Error(`Unexpected source inventory: ${keys.length} keys / ${locales.length} locales`);

const rawCatalogs = new Map();
for (const locale of locales) rawCatalogs.set(locale, await readJson(path.join(sourceRoot, "src/lib/i18n/locales", locale, "translation.json")));
const english = rawCatalogs.get("en-US");
const catalogs = new Map();
for (const locale of locales) {
	const bundled = rawCatalogs.get(locale);
	const assembled = { ...bundled };
	for (const key of Object.keys(english)) {
		if (!key.startsWith("settings.")) continue;
		assembled[key] = [bundled[key], english[key]].find((value) => value?.trim()) ?? "";
	}
	catalogs.set(locale, assembled);
}

const require = createRequire(path.join(sourceRoot, "package.json"));
const i18nextModule = require("i18next");
const i18next = i18nextModule.createInstance();
const resources = Object.fromEntries(locales.map((locale) => [locale, { translation: catalogs.get(locale) }]));
await i18next.init({
	lng: "en-US",
	resources,
	fallbackLng: { fr: ["fr-FR"], default: ["en-US"] },
	ns: "translation",
	keySeparator: false,
	nsSeparator: false,
	returnEmptyString: false,
	interpolation: { escapeValue: false },
});

globalThis.window = { location: { href: "http://localhost/auth" } };
globalThis.localStorage = {
	data: new Map(),
	getItem(key) { return this.data.get(key) ?? null; },
	setItem(key, value) { this.data.set(key, String(value)); },
};
const runtimePath = pathToFileURL(path.join(compiledOutdir, "runtime.js")).href;
const messagesPath = pathToFileURL(path.join(compiledOutdir, "messages.js")).href;
const runtime = await import(runtimePath);
const { m } = await import(messagesPath);

const sampleInputs = (key) => Object.fromEntries([...key.matchAll(/\{\{\s*([^{}]+?)\s*\}\}/g)].map(([, name]) => [
	name,
	name === "count" ? 2 : name === "provider" ? "OAuth / SAML" : name === "WEBUI_NAME" ? "Open WebUI & <Team>" : `sample-${name}`,
]));
const pluralKey = "Starting in {{count}} minutes";
const pluralCounts = [...new Set([
	...Array.from({ length: 201 }, (_, index) => index),
	-100, -21, -5, -2, -1, -0.5, 0.1, 0.5, 1.2, 1.5, 2.5, 21.5, 1000, 1_000_000,
])];
const mismatches = [];
let staticComparisons = 0;
let pluralComparisons = 0;

for (const locale of locales) {
	await i18next.changeLanguage(locale);
	await runtime.setLocale(locale, { reload: false });
	for (const key of keys) {
		const id = keyToId[key];
		const inputs = sampleInputs(key);
		const native = String(i18next.t(key, inputs));
		const compiled = String(m[id](inputs));
		staticComparisons++;
		if (native !== compiled) mismatches.push({ locale, key, inputs, native, compiled, kind: "key" });
	}
	for (const count of pluralCounts) {
		const inputs = { count };
		const native = String(i18next.t(pluralKey, inputs));
		const compiled = String(m[keyToId[pluralKey]](inputs));
		pluralComparisons++;
		if (native !== compiled) mismatches.push({ locale, key: pluralKey, inputs, native, compiled, kind: "plural" });
	}
}

const report = {
	date: new Date().toISOString(),
	appCommit: "f8ae8a6c328946dc62cd0712961a0632574581bf",
	compiledOutdir,
	nativePackage: "i18next 23.16.8",
	localeCount: locales.length,
	keyCount: keys.length,
	staticKeyComparisons: staticComparisons,
	pluralCountsPerLocale: pluralCounts.length,
	pluralComparisons,
	configuration: { fallbackLng: { fr: ["fr-FR"], default: ["en-US"] }, keySeparator: false, nsSeparator: false, returnEmptyString: false, escapeValue: false },
	inputSamples: { provider: "OAuth / SAML", WEBUI_NAME: "Open WebUI & <Team>", count: "integers 0 through 200, negative integers/fractions, positive fractions, 1000, and 1000000" },
	mismatchCount: mismatches.length,
	mismatches: mismatches.slice(0, 200),
};
await fs.mkdir(path.dirname(outputFile), { recursive: true });
await fs.writeFile(outputFile, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ outputFile, localeCount: locales.length, keyCount: keys.length, staticComparisons, pluralComparisons, mismatchCount: mismatches.length, mismatches: mismatches.slice(0, 12) }, null, 2));
if (mismatches.length) process.exitCode = 1;
