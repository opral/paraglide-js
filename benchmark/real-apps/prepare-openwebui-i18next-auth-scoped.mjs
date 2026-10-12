#!/usr/bin/env node
/**
 * Build a route-scoped native i18next control using the same literal auth-route
 * key inventory as the Paraglide adapter. Other routes and override-enabled
 * sessions continue loading the pinned full catalogs through the original
 * i18next resource backend.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const appRoot = path.resolve(process.env.OPENWEBUI_CANDIDATE ?? path.join(repo, ".real-apps/openwebui-i18next-auth-scoped"));
const sourceRoot = path.resolve(process.env.OPENWEBUI_SOURCE ?? path.join(repo, ".real-apps/open-webui-source"));
const capturePath = path.resolve(process.env.OPENWEBUI_CAPTURE ?? path.join(repo, "benchmark/real-apps/results/native-openweb-auth-fixture.json"));
const suffixes = ["zero", "one", "two", "few", "many", "other"];
const readJson = async (filename) => JSON.parse(await fs.readFile(filename, "utf8"));

const capture = await readJson(capturePath);
const routeResources = capture.apps?.[0]?.routeCapture?.runs?.[0]?.resources;
if (capture.apps?.[0]?.sha !== "f8ae8a6c328946dc62cd0712961a0632574581bf" || !routeResources) {
	throw new Error("Native route capture does not match the pinned Open WebUI checkout");
}
const sourceContents = new Map();
for (const resource of routeResources) {
	if (!resource.name.endsWith(".js")) continue;
	const mapPath = path.join(sourceRoot, "build", `${resource.name.slice(1)}.map`);
	try {
		const map = await readJson(mapPath);
		for (let index = 0; index < map.sources.length; index++) {
			if (map.sources[index]?.includes("/src/") && typeof map.sourcesContent?.[index] === "string") {
				sourceContents.set(map.sources[index], map.sourcesContent[index]);
			}
		}
	} catch { /* Some runtime-only assets have no source maps. */ }
}
const keyPattern = /(?:\$i18n|\bi18n)\.t\s*\(/g;
const keys = new Set();
let literalCalls = 0;
const dynamicCalls = [];
for (const [source, contents] of sourceContents) {
	for (const match of contents.matchAll(keyPattern)) {
		let cursor = match.index + match[0].length;
		while (/\s/.test(contents[cursor] ?? "")) cursor++;
		const quote = contents[cursor];
		if (quote !== "'" && quote !== '"' && quote !== "`") { dynamicCalls.push(source); continue; }
		let end = cursor + 1;
		let escaped = false;
		for (; end < contents.length; end++) {
			const char = contents[end];
			if (escaped) escaped = false;
			else if (char === "\\") escaped = true;
			else if (char === quote) break;
		}
		const raw = contents.slice(cursor + 1, end);
		if (quote === "`" && raw.includes("${")) { dynamicCalls.push(source); continue; }
		keys.add(raw.replace(/\\([\\'"`])/g, "$1"));
		literalCalls++;
	}
}
const sortedKeys = [...keys].sort();
if (dynamicCalls.length) throw new Error(`Auth route has dynamic translation calls: ${JSON.stringify(dynamicCalls)}`);
if (sortedKeys.length !== 106 || literalCalls !== 115) throw new Error(`Expected 106 keys/115 calls, found ${sortedKeys.length}/${literalCalls}`);
const pluralParents = sortedKeys.filter((key) => key.includes("{{count}}"));
if (pluralParents.length !== 1 || pluralParents[0] !== "Starting in {{count}} minutes") {
	throw new Error(`Unexpected plural parent keys: ${JSON.stringify(pluralParents)}`);
}

const localeRoot = path.join(sourceRoot, "src/lib/i18n/locales");
const locales = (await fs.readdir(localeRoot, { withFileTypes: true }))
	.filter((entry) => entry.isDirectory())
	.map((entry) => entry.name)
	.sort();
if (locales.length !== 64 || !locales.includes("en-US") || !locales.includes("fr-FR")) {
	throw new Error(`Expected the pinned 64 locales, found ${locales.length}`);
}

const outputRoot = path.join(appRoot, "src/lib/i18n/auth-locales");
await fs.rm(outputRoot, { recursive: true, force: true });
await fs.mkdir(outputRoot, { recursive: true });
for (const locale of locales) {
	const full = await readJson(path.join(localeRoot, locale, "translation.json"));
	const subset = {};
	for (const key of sortedKeys) {
		if (Object.hasOwn(full, key)) subset[key] = full[key];
		if (key === pluralParents[0]) {
			for (const suffix of suffixes) {
				const pluralKey = `${key}_${suffix}`;
				if (Object.hasOwn(full, pluralKey)) subset[pluralKey] = full[pluralKey];
			}
		}
	}
	const directory = path.join(outputRoot, locale);
	await fs.mkdir(directory, { recursive: true });
	await fs.writeFile(path.join(directory, "translation.json"), `${JSON.stringify(subset)}\n`);
}

const indexPath = path.join(appRoot, "src/lib/i18n/index.ts");
const original = await fs.readFile(indexPath, "utf8");
const loaderAnchor = `export const loadBundledResource = async (language: string): Promise<Record<string, string>> =>\n\t(await import(\`./locales/\${language}/translation.json\`)).default;`;
if (!original.includes(loaderAnchor)) throw new Error("Native bundled-resource loader changed; refusing to patch");
let updated = original.replace(loaderAnchor, `${loaderAnchor}\n\nconst loadBundledAuthResource = async (language: string): Promise<Record<string, string>> =>\n\t(await import(\`./auth-locales/\${language}/translation.json\`)).default;`);
const resourceAnchor = `const loadResource = async (language: string) =>\n\tassembleSettingsTranslations(\n\t\tawait loadBundledResource(language),\n\t\tawait loadBundledResource('en-US'),\n\t\toverrides[language],\n\t\toverrides['en-US']\n\t);`;
if (!updated.includes(resourceAnchor)) throw new Error("Native loadResource implementation changed; refusing to patch");
updated = updated.replace(resourceAnchor, `const loadResource = async (language: string) => {
\tconst authRoute = typeof window !== 'undefined' && window.location.pathname === '/auth';
\tconst canUseScopedAuthCatalog = authRoute && Object.keys(overrides).length === 0;
\tconst load = canUseScopedAuthCatalog ? loadBundledAuthResource : loadBundledResource;
\treturn assembleSettingsTranslations(
\t\tawait load(language),
\t\tawait load('en-US'),
\t\toverrides[language],
\t\toverrides['en-US']
\t);
};`);
await fs.writeFile(indexPath, updated);

const inventory = {
	pinnedCommit: "f8ae8a6c328946dc62cd0712961a0632574581bf",
	route: "/auth?lang=fr-FR",
	capturePath,
	literalKeyCount: sortedKeys.length,
	literalCallCount: literalCalls,
	pluralFamily: pluralParents[0],
	pluralSuffixKeys: suffixes.map((suffix) => `${pluralParents[0]}_${suffix}`),
	localeCount: locales.length,
	resourceMode: "i18next remains the runtime engine. On /auth with no backend translation overrides, it dynamically loads the exact auth key subset for the requested locale and en-US fallback; every other route and override-enabled /auth loads original full catalogs.",
	otherRouteFallback: "original pinned i18next resource loader and full catalogs",
};
await fs.writeFile(path.join(appRoot, "openwebui-i18next-auth-scoped-inventory.json"), `${JSON.stringify(inventory, null, 2)}\n`);
console.log(JSON.stringify({ appRoot, keyCount: sortedKeys.length, literalCalls, localeCount: locales.length, pluralFamily: pluralParents[0], generatedLocaleFiles: locales.length }, null, 2));
