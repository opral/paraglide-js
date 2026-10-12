import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const compilerRepo = path.resolve(here, "../..");
const appRoot = process.env.NTFY_WEB_ROOT ?? "/root/repos-iii/ntfy-native-ab/web";
const outputRoot = process.env.NTFY_BENCHMARK_OUTPUT_ROOT ?? path.join(compilerRepo, ".real-apps/ntfy-ab");
const localeDir = path.join(appRoot, "public/static/langs");
const messagesRoot = path.join(appRoot, "project.inlang/messages");

const pluralCategories = new Set(["zero", "one", "two", "few", "many", "other"]);
const toLocale = (filename) => filename.slice(0, -5).replaceAll("_", "-");

function convertInterpolation(value, variableIds) {
	let converted = "";
	for (let index = 0; index < value.length;) {
		if (value[index] === "\\") {
			converted += "\\\\";
			index++;
			continue;
		}
		if (value.startsWith("{{", index)) {
			const closingIndex = value.indexOf("}}", index + 2);
			if (closingIndex !== -1) {
				const rawName = value.slice(index + 2, closingIndex);
				const name = rawName.trim();
				if (/[{}]/.test(rawName)) {
					for (const char of value.slice(index, closingIndex + 2)) {
						converted += char === "\\" ? "\\\\" : char === "{" || char === "}" ? `\\${char}` : char;
					}
					index = closingIndex + 2;
					continue;
				}
				if (name.length > 0 && !/[{}]/.test(name) && variableIds.has(name)) {
					converted += `{${variableIds.get(name)}}`;
					index = closingIndex + 2;
					continue;
				}
			}
		}
		const char = value[index++];
		// The message-format parser accepts backslash escapes for literal braces.
		// This leaves malformed and unresolved i18next markers byte-for-byte intact.
		converted += char === "{" || char === "}" ? `\\${char}` : char;
	}
	return converted
		.replace(/<([A-Za-z][A-Za-z0-9]*)\s*\/>/g, "{#$1/}")
		.replace(/<([A-Za-z][A-Za-z0-9]*)>/g, "{#$1}")
		.replace(/<\/([A-Za-z][A-Za-z0-9]*)>/g, "{/$1}");
}

const localeFiles = (await fs.readdir(localeDir)).filter((name) => name.endsWith(".json")).sort();
const catalogs = {};
for (const filename of localeFiles) {
	const locale = toLocale(filename);
	catalogs[locale] = JSON.parse(await fs.readFile(path.join(localeDir, filename), "utf8"));
}
if (!catalogs.en) throw new Error("Native English locale catalog missing");

const allKeys = [...new Set(Object.values(catalogs).flatMap(Object.keys))].sort();
const grouped = new Map();
for (const key of allKeys) {
	const separator = key.lastIndexOf("_");
	const suffix = separator < 0 ? "" : key.slice(separator + 1);
	if (pluralCategories.has(suffix)) {
		const base = key.slice(0, separator);
		grouped.set(base, [...(grouped.get(base) ?? []), key]);
	}
}
const messageKeys = [...new Set(allKeys.map((key) => {
	const separator = key.lastIndexOf("_");
	const suffix = separator < 0 ? "" : key.slice(separator + 1);
	return pluralCategories.has(suffix) ? key.slice(0, separator) : key;
}))].sort();
const mapping = Object.fromEntries(messageKeys.map((key, index) => [key, `k${index}`]));
const interpolationPattern = /\{\{\s*([^{}]+?)\s*\}\}/g;
const inputMetadata = Object.fromEntries(messageKeys.map((key) => {
	const candidates = [key, ...(grouped.get(key) ?? [])];
	const names = new Set();
	for (const catalog of Object.values(catalogs)) {
		for (const candidate of candidates) {
			const value = catalog[candidate];
			if (typeof value !== "string") continue;
			for (const [, name] of value.matchAll(interpolationPattern)) names.add(name.trim());
		}
	}
	return [key, Object.fromEntries([...names].sort().map((name, index) => [name, `p${index}`]))];
}));
const pluralSamples = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 20, 21, 22, 25, 100, 101, 102, 103, 111, 1000, 1000000];
const englishPluralRules = new Intl.PluralRules("en");

await fs.rm(messagesRoot, { recursive: true, force: true });
await fs.mkdir(messagesRoot, { recursive: true });
for (const [locale, catalog] of Object.entries(catalogs)) {
	const languageFallback = locale.includes("-") ? (catalogs[locale.split("-")[0]] ?? {}) : {};
	const sourceCatalog = { ...languageFallback, ...catalog };
	const merged = { ...catalogs.en, ...languageFallback, ...catalog };
	const variableIdsFor = (key) => new Map(Object.entries(inputMetadata[key] ?? {}));
	for (const [base, variants] of grouped) {
		const fallbackOther = catalogs.en[`${base}_other`] ?? base;
		for (const variant of variants) {
			if (!Object.hasOwn(merged, variant)) merged[variant] = fallbackOther;
		}
	}
	const result = {};
	for (const key of messageKeys) {
		const sourceForms = Object.fromEntries(
			[...pluralCategories]
				.filter((category) => Object.hasOwn(sourceCatalog, `${key}_${category}`))
				.map((category) => [category, sourceCatalog[`${key}_${category}`]])
		);
		if (!grouped.has(key)) {
			result[mapping[key]] = convertInterpolation(merged[key] ?? key, variableIdsFor(key));
			continue;
		}
		const localePluralRules = new Intl.PluralRules(locale);
		const categories = new Set([...localePluralRules.resolvedOptions().pluralCategories, ...Object.keys(sourceForms), "other"]);
		const match = {};
		for (const category of [...categories].sort((a, b) => a === "other" ? 1 : b === "other" ? -1 : a.localeCompare(b))) {
			const localValue = sourceForms[category];
			const categorySamples = pluralSamples.filter((count) => localePluralRules.select(count) === category);
			const representative = categorySamples[0] ?? 2;
			const englishCategory = englishPluralRules.select(representative);
			const fallbackValue = catalogs.en[`${key}_${englishCategory}`] ?? catalogs.en[`${key}_other`] ?? catalogs.en[key] ?? key;
			const selector = category === "other" ? "*" : category;
			const text = convertInterpolation(localValue ?? fallbackValue, variableIdsFor(key));
			match[`countPlural=${selector}`] = text;
			if (localValue === undefined) {
				for (const exactCount of pluralSamples) {
					if (exactCount === 0 && Object.hasOwn(sourceForms, "zero")) continue;
					if (localePluralRules.select(exactCount) !== category || englishPluralRules.select(exactCount) === englishCategory) continue;
					const exactCategory = englishPluralRules.select(exactCount);
					const exactValue = catalogs.en[`${key}_${exactCategory}`] ?? catalogs.en[`${key}_other`] ?? catalogs.en[key] ?? key;
					match[`countPluralExact=${exactCount},countPlural=${selector}`] = convertInterpolation(exactValue, variableIdsFor(key));
				}
			}
		}
		if (Object.hasOwn(sourceForms, "zero")) {
			match["countPluralExact=0"] = convertInterpolation(sourceForms.zero, variableIdsFor(key));
		}
		const allPatterns = Object.values(match);
		const inputs = new Set(["count"]);
		for (const text of allPatterns) {
			for (const [, name] of text.matchAll(/\{(p\d+)\}/g)) inputs.add(name);
		}
		result[mapping[key]] = [{
			declarations: [...[...inputs].map((name) => `input ${name}`), "local countPluralExact = count", "local countPlural = count: plural"],
			selectors: ["countPluralExact", "countPlural"],
			match,
		}];
	}
	await fs.writeFile(path.join(messagesRoot, `${locale}.json`), `${JSON.stringify(result, null, 2)}\n`);
}

const projectDir = path.join(appRoot, "project.inlang");
await fs.mkdir(projectDir, { recursive: true });
await fs.writeFile(path.join(projectDir, "settings.json"), `${JSON.stringify({
	$schema: "https://inlang.com/schema/project-settings",
	baseLocale: "en",
	locales: Object.keys(catalogs),
	modules: ["./node_modules/@inlang/plugin-message-format/dist/index.js"],
	"plugin.inlang.messageFormat": {
		pathPattern: "./project.inlang/messages/{locale}.json",
	},
}, null, 2)}\n`);
await fs.writeFile(path.join(appRoot, "project.inlang/paraglide.config.js"), `export default {\n  outdir: "./src/paraglide",\n  strategy: ["localStorage", "baseLocale"],\n  localStorageKey: "i18nextLng",\n  emitTsDeclarations: false,\n};\n`);
await fs.mkdir(path.join(appRoot, "node_modules/@inlang"), { recursive: true });
const pluginRepo = process.env.PARAGLIDE_REPO_ROOT ?? "/root/repos-iii/paraglide-client-split-pr4";
const pluginPath = path.join(pluginRepo, "node_modules/@inlang/plugin-message-format");
try {
	await fs.symlink(pluginPath, path.join(appRoot, "node_modules/@inlang/plugin-message-format"), "dir");
} catch (error) {
	if (error.code !== "EEXIST") throw error;
}

await fs.mkdir(outputRoot, { recursive: true });
await fs.writeFile(path.join(outputRoot, "mapping.json"), `${JSON.stringify(mapping, null, 2)}\n`);
await fs.writeFile(path.join(outputRoot, "catalog-meta.json"), `${JSON.stringify({
	fileCount: localeFiles.length,
	keyCount: allKeys.length,
	messageCount: messageKeys.length,
	pluralGroups: Object.fromEntries(grouped),
	locales: Object.fromEntries(Object.entries(catalogs).map(([locale, catalog]) => [locale, { keys: Object.keys(catalog).length, filledFallbackKeys: Math.max(0, allKeys.length - Object.keys(catalog).length) }])),
}, null, 2)}\n`);
await fs.writeFile(path.join(outputRoot, "input-metadata.json"), `${JSON.stringify(inputMetadata, null, 2)}\n`);
console.log(`Prepared ${localeFiles.length} locale catalogs, ${allKeys.length} raw keys / ${messageKeys.length} messages in ${messagesRoot}`);
