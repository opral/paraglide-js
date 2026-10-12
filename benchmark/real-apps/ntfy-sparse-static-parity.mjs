import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const [metadataPathArg, fullDistArg, sparseDistArg, reportPathArg] = process.argv.slice(2);
if (!metadataPathArg || !fullDistArg || !sparseDistArg) {
	throw new Error("Usage: node ntfy-sparse-static-parity.mjs <client-locale-split.json> <full-dist> <sparse-dist> [report-json]");
}

const metadata = JSON.parse(await fs.readFile(path.resolve(metadataPathArg), "utf8"));
const locales = [...metadata.locales].sort((left, right) => right.length - left.length);
const messageCount = metadata.messages.length;
const normalizeValue = (value) => typeof value === "function" ? `function:${value.toString()}` : value;

async function loadLocaleModules(distArg) {
	const mediaRoot = path.join(path.resolve(distArg), "static/media");
	const files = (await fs.readdir(mediaRoot)).filter((file) =>
		file.startsWith("_paraglide_client-locale-split_locale_") && file.endsWith(".js"),
	);
	const modules = new Map();
	for (const file of files) {
		const locale = locales.find((candidate) => file.startsWith(`_paraglide_client-locale-split_locale_${candidate}-`));
		if (!locale) throw new Error(`Could not resolve locale from generated chunk name ${file}`);
		if (modules.has(locale)) throw new Error(`Multiple generated chunks found for locale ${locale}`);
		const { default: messages } = await import(pathToFileURL(path.join(mediaRoot, file)).href);
		if (!Array.isArray(messages)) throw new Error(`Locale chunk ${file} does not export a message array`);
		modules.set(locale, messages);
	}
	return modules;
}

const [full, sparse] = await Promise.all([
	loadLocaleModules(fullDistArg),
	loadLocaleModules(sparseDistArg),
]);
if (full.size !== locales.length || sparse.size !== locales.length) {
	throw new Error(`Expected ${locales.length} locales; found full=${full.size}, sparse=${sparse.size}`);
}
const baseMessages = sparse.get(metadata.baseLocale);
if (!baseMessages) throw new Error(`Missing sparse base locale ${metadata.baseLocale}`);

const mismatches = [];
let sparseSlotCount = 0;
for (const locale of metadata.locales) {
	const expected = full.get(locale);
	const actual = sparse.get(locale);
	if (expected.length !== messageCount || actual.length !== messageCount) {
		mismatches.push({ locale, error: "message array length differs from catalog", expected: expected.length, actual: actual.length });
		continue;
	}
	for (let index = 0; index < messageCount; index++) {
		let materialized = actual[index];
		if (materialized === undefined && locale !== metadata.baseLocale) {
			sparseSlotCount++;
			materialized = baseMessages[index];
		}
		if (normalizeValue(materialized) !== normalizeValue(expected[index])) {
			mismatches.push({ locale, index, expectedType: typeof expected[index], actualType: typeof materialized });
			if (mismatches.length >= 100) break;
		}
	}
}

const report = {
	method: "Import both emitted locale arrays; materialize sparse undefined slots from the emitted base array and compare each string/function body.",
	baseLocale: metadata.baseLocale,
	localeCount: locales.length,
	messageCount,
	checkedCells: locales.length * messageCount,
	sparseSlotCount,
	mismatchCount: mismatches.length,
	mismatches,
	pass: mismatches.length === 0,
};
if (reportPathArg) {
	await fs.writeFile(path.resolve(reportPathArg), `${JSON.stringify(report, null, 2)}\n`);
}
console.log(JSON.stringify(report, null, 2));
if (!report.pass) process.exitCode = 1;
