import fs from "node:fs/promises";
import path from "node:path";
import { parse } from "/root/repos-iii/paraglide-native-route-survey/.real-apps/stirling-pdf-source/frontend/node_modules/smol-toml/dist/index.js";

const [nativeReportFile, nativeDistArg, catalogRootArg, outputFile] = process.argv.slice(2);
if (!nativeReportFile || !nativeDistArg || !catalogRootArg || !outputFile) {
	throw new Error(
		"Usage: node stirling-route-inventory.mjs <native-ab-report.json> <native-dist> <locales-dir> <output-json>",
	);
}

function flatten(value, prefix = "", result = {}) {
	for (const [key, entry] of Object.entries(value)) {
		const fullKey = prefix ? `${prefix}.${key}` : key;
		if (typeof entry === "string") result[fullKey] = entry;
		else if (entry && typeof entry === "object" && !Array.isArray(entry)) {
			flatten(entry, fullKey, result);
		} else {
			throw new Error(`Unsupported catalog value at ${fullKey}`);
		}
	}
	return result;
}

const nativeReport = JSON.parse(await fs.readFile(nativeReportFile, "utf8"));
const nativeResult = nativeReport.results.find((result) => result.label === "native-i18next");
const routeRun = nativeResult?.runs.find((run) => run.resources?.length);
if (!routeRun) throw new Error("The native report has no captured route resource list.");
const nativeDist = path.resolve(nativeDistArg);
const routeNames = [...new Set(routeRun.resources
	.map((resource) => resource.name)
	.filter((name) => name.startsWith("/assets/") && name.endsWith(".js")))];
const routeSource = await Promise.all(routeNames.map(async (name) => {
	const file = path.resolve(nativeDist, `.${decodeURIComponent(name)}`);
	if (!file.startsWith(`${nativeDist}${path.sep}`)) throw new Error(`Invalid route asset path ${name}`);
	return [name, await fs.readFile(file, "utf8")];
}));

const catalogRoot = path.resolve(catalogRootArg);
const locales = await fs.readdir(catalogRoot);
const catalogs = {};
for (const locale of locales.sort()) {
	const filename = path.join(catalogRoot, locale, "translation.toml");
	try {
		catalogs[locale] = flatten(parse(await fs.readFile(filename, "utf8")));
	} catch (error) {
		if (error?.code !== "ENOENT") throw error;
	}
}
const allCatalogKeys = [...new Set(Object.values(catalogs).flatMap(Object.keys))].sort();
const keys = allCatalogKeys.filter((key) => routeSource.some(([, source]) => source.includes(key)));
const dynamicKeys = [
	"toolPicker.subcategories.ai",
	"toolPicker.subcategories.signing",
	"toolPicker.subcategories.documentSecurity",
	"toolPicker.subcategories.verification",
	"toolPicker.subcategories.documentReview",
	"toolPicker.subcategories.pageFormatting",
	"toolPicker.subcategories.extraction",
	"toolPicker.subcategories.removal",
	"toolPicker.subcategories.automation",
	"toolPicker.subcategories.general",
	"toolPicker.subcategories.advancedFormatting",
	"toolPicker.subcategories.developerTools",
];
const output = {
	method: "lexical substring match of catalog keys against JavaScript resources captured from the pinned native initial route; dynamic tool-picker IDs are listed separately and retained manually",
	chunks: routeSource.length,
	uniqueKeys: keys.length,
	totalCatalogKeys: allCatalogKeys.length,
	routeKeysPct: Number((keys.length / allCatalogKeys.length * 100).toFixed(1)),
	names: routeSource.map(([name]) => name),
	keys,
	dynamicKeys,
};
await fs.writeFile(outputFile, `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify({ chunks: output.chunks, uniqueKeys: output.uniqueKeys, totalCatalogKeys: output.totalCatalogKeys, routeKeysPct: output.routeKeysPct, dynamicKeys: output.dynamicKeys.length, outputFile: path.resolve(outputFile) }, null, 2));
