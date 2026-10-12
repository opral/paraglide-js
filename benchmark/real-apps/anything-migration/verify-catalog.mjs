import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { resources } from "../anything-llm-source/frontend/src/locales/resources.js";
import { setLocale } from "./frontend/src/paraglide/runtime.js";
import * as messages from "./frontend/src/paraglide/messages.js";
import i18next from "../anything-llm-source/frontend/node_modules/i18next/dist/esm/i18next.js";

const { locales, catalogs, pluralBases, transKeys } = JSON.parse(
	await fs.readFile(".real-apps/anything-migration/catalogs.json", "utf8")
);
const mapping = JSON.parse(
	await fs.readFile(".real-apps/anything-migration/mapping.json", "utf8")
);
const original = Object.fromEntries(
	Object.entries(resources).map(([locale, record]) => [
		locale,
		{ common: record.common },
	])
);
const native = i18next.createInstance();
await native.init({
	lng: "en",
	fallbackLng: "en",
	initImmediate: false,
	defaultNS: "common",
	lowerCaseLng: true,
	interpolation: { escapeValue: false },
	resources: original,
});
const names = (text) => [
	...new Set(
		[...text.matchAll(/\{\{\s*([^{}]+?)\s*\}\}/g)].map((m) => m[1].trim())
	),
];
let parity = 0;
const mismatches = [];
for (const locale of locales) {
	for (const [key, text] of Object.entries(catalogs[locale])) {
		if (
			pluralBases.some(
				({ oneKey, otherKey }) => key === oneKey || key === otherKey
			)
		)
			continue;
		if (transKeys.includes(key)) continue; // These keys render compiler .parts() through Trans.
		const inputs = Object.fromEntries(
			names(text).map((name) => [name, name === "count" ? 7 : "SAMPLE"])
		);
		const expected = native.t(key, { ...inputs, lng: locale });
		const actual = messages[mapping[key]](inputs, { locale });
		if (expected !== actual && mismatches.length < 25)
			mismatches.push({ locale, key, expected, actual });
		parity++;
	}
}
let pluralChecks = 0;
const counts = [0, 1, 2, 3, 5, 11, 21, 101, 1.5];
for (const { base } of pluralBases) {
	for (const locale of locales) {
		for (const count of counts) {
			const expected = native.t(base, { lng: locale, count });
			const actual = messages[mapping[base]]({ count }, { locale });
			if (expected !== actual && mismatches.length < 25) {
				mismatches.push({ locale, key: base, count, expected, actual });
			}
			pluralChecks++;
		}
	}
}
if (mismatches.length) throw new Error(JSON.stringify(mismatches, null, 2));

const allKeys = Object.keys(mapping);
for (const locale of [
	"en",
	"fr",
	"fr-FR",
	"zh-TW",
	"pt-BR",
	"fa",
	"ar",
	"ru",
	"vi-VN",
]) {
	const resolved =
		locale === "fr-FR"
			? "fr"
			: locale === "zh-TW"
				? "zh-tw"
				: locale === "pt-BR"
					? "pt"
					: locale === "vi-VN"
						? "vi"
						: locale.toLowerCase();
	if (!locales.includes(resolved)) continue;
	setLocale(resolved, { reload: false });
	for (const key of allKeys) {
		if (transKeys.includes(key)) continue;
		const plural = pluralBases.find(({ base }) => base === key);
		const sourceText = plural
			? (catalogs[resolved][plural.otherKey] ?? catalogs.en[plural.otherKey])
			: (catalogs[resolved][key] ?? catalogs.en[key] ?? "");
		const inputs = Object.fromEntries(
			names(sourceText).map((name) => [name, name === "count" ? 2 : "SAMPLE"])
		);
		const expected = native.t(key, { ...inputs, lng: locale });
		const actual = messages[mapping[key]](inputs, { locale: resolved });
		if (expected !== actual && mismatches.length < 25)
			mismatches.push({ locale, key, expected, actual });
	}
}
if (mismatches.length) throw new Error(JSON.stringify(mismatches, null, 2));
console.log(
	JSON.stringify(
		{
			locales: locales.length,
			sourceKeys:
				Object.values(catalogs).reduce(
					(sum, catalog) => sum + Object.keys(catalog).length,
					0
				) / locales.length,
			transKeys: transKeys.length,
			ordinaryChecks: parity,
			pluralChecks,
			regionCases: 9,
			result: "all catalog and plural parity checks passed",
		},
		null,
		2
	)
);
