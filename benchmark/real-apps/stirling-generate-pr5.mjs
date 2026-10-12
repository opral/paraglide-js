import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { parse } from "/root/repos-iii/paraglide-native-route-survey/.real-apps/stirling-pdf-source/frontend/node_modules/smol-toml/dist/index.js";

const source = process.env.STIRLING_CATALOGS ?? "/root/repos-iii/paraglide-native-route-survey/.real-apps/stirling-pdf-source/frontend/editor/public/locales";
const compiler = process.env.STIRLING_PARAGLIDE_COMPILER ?? "/root/repos-iii/paraglide-client-payload-pr5/dist";
const outdir = process.env.STIRLING_PARAGLIDE_OUTPUT ?? "/root/repos-iii/paraglide-real-apps/.real-apps/stirling/pr5-locale-modules";
const compilerCommit = process.env.STIRLING_PARAGLIDE_COMPILER_COMMIT ?? "d97b836a9156d6073111fc3f28486152b8ba8455";
const { compileBundle } = await import(pathToFileURL(path.join(compiler, "compiler/compile-bundle.js")));
const output = await import(pathToFileURL(path.join(compiler, "compiler/output-structure/locale-modules.js")));
const { createRuntimeFile } = await import(pathToFileURL(path.join(compiler, "compiler/runtime/create-runtime.js")));
const { defaultCompilerOptions } = await import(pathToFileURL(path.join(compiler, "compiler/compiler-options.js")));
const { createRegistry } = await import(pathToFileURL(path.join(compiler, "compiler/registry.js")));
const { toSafeModuleId } = await import(pathToFileURL(path.join(compiler, "compiler/safe-module-id.js")));
const locales = (await fs.readdir(source)).sort();
const catalogs = {};

function flatten(value, prefix = "", result = {}) {
	for (const [key, entry] of Object.entries(value)) {
		const fullKey = prefix ? `${prefix}.${key}` : key;
		if (typeof entry === "string") result[fullKey] = entry;
		else if (entry && typeof entry === "object" && !Array.isArray(entry)) flatten(entry, fullKey, result);
		else throw new Error(`Unsupported catalog value at ${fullKey}`);
	}
	return result;
}
for (const locale of locales) catalogs[locale] = flatten(parse(await fs.readFile(path.join(source, locale, "translation.toml"), "utf8")));

const allKeys = [...new Set(Object.values(catalogs).flatMap((catalog) => Object.keys(catalog)))].sort();
const pluralSuffix = /_((zero)|(one)|(two)|(few)|(many)|(other))$/;
const pluralBases = new Set(allKeys.filter((key) => pluralSuffix.test(key)).map((key) => key.replace(pluralSuffix, "")).filter((base) => !allKeys.includes(base)));
const logicalKeys = allKeys.filter((key) => !pluralSuffix.test(key)).concat([...pluralBases]).sort();
const mapping = Object.fromEntries(logicalKeys.map((key, index) => [key, `k${index}`]));
for (const base of pluralBases) {
	for (const locale of locales) for (const key of Object.keys(catalogs[locale])) {
		if (key.startsWith(`${base}_`) && pluralSuffix.test(key)) mapping[key] = mapping[base];
	}
}
const fallbackMap = Object.fromEntries(locales.map((locale) => [locale, locale === "en-US" ? undefined : "en-US"]));
const bundles = [];
const excluded = [];
const pluralCategories = ["zero", "one", "two", "few", "many", "other"];

function pattern(text) {
	const parts = [];
	let offset = 0;
	for (const match of text.matchAll(/\{\{\s*([^{}]+?)\s*\}\}/g)) {
		if (/[,-]/.test(match[1])) throw new Error(`Unsupported interpolation ${match[0]}`);
		if (match.index > offset) parts.push({ type: "text", value: text.slice(offset, match.index) });
		parts.push({ type: "expression", arg: { type: "variable-reference", name: match[1] } });
		offset = match.index + match[0].length;
	}
	if (offset < text.length || !parts.length) parts.push({ type: "text", value: text.slice(offset) });
	return parts;
}
const input = (name) => ({ type: "input-variable", name });
for (const key of logicalKeys) {
	const plural = pluralBases.has(key);
	const entries = plural
		? locales.flatMap((locale) => pluralCategories.flatMap((category) => {
			const value = catalogs[locale][`${key}_${category}`];
			return value === undefined ? [] : [{ locale, category, value }];
		}))
		: locales.flatMap((locale) => catalogs[locale][key] === undefined ? [] : [{ locale, category: null, value: catalogs[locale][key] }]);
	const values = entries.map((entry) => entry.value);
	if (values.some((value) => /\$t\(|\{\{[^}]*[,-][^}]*\}\}/.test(value))) {
		excluded.push(key);
		continue;
	}
	const variables = [...new Set(values.flatMap((value) => [...value.matchAll(/\{\{\s*([^{}]+?)\s*\}\}/g)].map((match) => match[1])))];
	const declarations = variables.filter((name) => !(plural && name === "count")).map(input);
	if (plural) {
		declarations.push(input("count"));
		declarations.push({ type: "local-variable", name: "countPlural", value: { type: "expression", arg: { type: "variable-reference", name: "count" }, annotation: { type: "function-reference", name: "plural", options: [] } } });
	}
	const messages = locales.flatMap((locale) => {
		const localized = entries.filter((entry) => entry.locale === locale);
		if (!localized.length) return [];
		if (!plural) return [{ id: `${mapping[key]}-${locale}`, bundleId: mapping[key], locale, selectors: [], variants: [{ id: "v", matches: [], pattern: pattern(localized[0].value) }] }];
		return [{ id: `${mapping[key]}-${locale}`, bundleId: mapping[key], locale, selectors: [{ type: "variable-reference", name: "countPlural" }], variants: localized.map((entry) => ({ id: `${mapping[key]}-${locale}-${entry.category}`, matches: [{ type: "literal-match", key: "countPlural", value: entry.category }], pattern: pattern(entry.value) })) }];
	});
	bundles.push({ id: mapping[key], declarations, messages });
}

const settings = { baseLocale: "en-US", locales };
const localNames = new Map(locales.map((locale) => [locale, output.createLocaleFunctionLocalNames(bundles, locale)]));
const compiled = bundles.map((bundle) => compileBundle({ bundle, fallbackMap, settings, inlineMessages: false, messageReferenceExpression: output.messageReferenceExpression }));
const files = {
	...output.generateOutput(compiled, settings, fallbackMap, false, localNames),
	"runtime.js": createRuntimeFile({ ...settings, compilerOptions: { ...defaultCompilerOptions, strategy: ["localStorage", "preferredLanguage", "baseLocale"] } }),
	"registry.js": createRegistry(),
	"messages.js": "export * from './messages/_index.js'\nexport * as m from './messages/_index.js'",
	"package.json": '{"type":"module"}',
};
const splitMetadata = {
	baseLocale: settings.baseLocale,
	locales,
	messages: bundles.map((bundle) => ({
		safeName: toSafeModuleId(bundle.id),
		publicName: bundle.id,
		hasInputs: bundle.declarations.length > 0,
		hasMarkup: bundle.messages.some((message) => message.variants.some((variant) => variant.pattern.some((part) => part.type.startsWith("markup-")))),
		staticTexts: Object.fromEntries(bundle.messages.flatMap((message) => {
			const variant = message.variants.length === 1 ? message.variants[0] : undefined;
			if (!variant || !variant.pattern.every((part) => part.type === "text")) return [];
			return [[message.locale, variant.pattern.map((part) => part.type === "text" ? part.value : "").join("").replace(/\r\n?/g, "\n")]];
		})),
	})),
};

await fs.mkdir(outdir, { recursive: true });
for (const [name, code] of Object.entries(files)) {
	const filename = path.join(outdir, name);
	await fs.mkdir(path.dirname(filename), { recursive: true });
	await fs.writeFile(filename, code);
}
await fs.writeFile(path.join(outdir, "mapping.json"), JSON.stringify(mapping));
await fs.writeFile(path.join(outdir, "catalogs.json"), JSON.stringify(catalogs));
await fs.writeFile(path.join(outdir, "client-locale-split.json"), JSON.stringify(splitMetadata));
const zlib = await import("node:zlib");
const stats = [];
for (const locale of ["en-US", "fr-FR"]) {
	const code = await fs.readFile(path.join(outdir, "messages", `${locale}.js`));
	stats.push({ locale, raw: code.length, brotliQ4: zlib.brotliCompressSync(code, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 4 } }).length });
}
console.log(JSON.stringify({ compilerCommit, locales: locales.length, allCatalogKeys: allKeys.length, logicalKeys: logicalKeys.length, compiledBundles: bundles.length, excluded: excluded.length, excludedSamples: excluded.slice(0, 10), metadataMessages: splitMetadata.messages.length, staticTextsByLocale: Object.fromEntries(locales.map((locale) => [locale, splitMetadata.messages.filter((message) => Object.hasOwn(message.staticTexts, locale)).length])), selectedLocaleStats: stats }, null, 2));
