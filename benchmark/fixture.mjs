import fs from "node:fs/promises";
import crypto from "node:crypto";
import { gunzipSync } from "node:zlib";
import { locales } from "./config.mjs";

const raw = Object.fromEntries(
	await Promise.all(
		locales.map(async (l) => [
			l,
			JSON.parse(
				gunzipSync(await fs.readFile(`corpus/${l}.json.gz`)).toString("utf8")
			),
		])
	)
);
const params = (text) =>
	[...text.matchAll(/{{\s*(\w+)\s*}}/g)].map((m) => m[1]).sort();
function supported(key) {
	if (typeof raw.en[key] !== "string") return false;
	if (/_(one|other|zero|few|many|two)$/.test(key)) return false;
	const enParams = JSON.stringify(params(raw.en[key] ?? ""));
	return locales.every((l) => {
		const text = raw[l][key];
		return (
			typeof text === "string" &&
			text.length > 0 &&
			!/[<>]|\$t\(/.test(text) &&
			!/[{}]/.test(text.replace(/{{\s*\w+\s*}}/g, "")) &&
			JSON.stringify(params(text)) === enParams
		);
	});
}
const keys = Object.keys(raw.en)
	.filter(supported)
	.sort((a, b) => {
		const hash = (k) =>
			crypto.createHash("sha256").update(`fair-i18n-v1:${k}`).digest("hex");
		return hash(a).localeCompare(hash(b));
	});
const staticKeys = keys.filter((k) => !params(raw.en[k]).length);
const dynamicKeys = keys.filter((k) => params(raw.en[k]).length);
// Deterministic selection, not chosen based on any measured result. Aim for
// 20% interpolated messages until the source's dynamic keys are exhausted.
const selected = [];
for (let i = 0; selected.length < keys.length; i++) {
	const bucket =
		i % 5 === 0 && dynamicKeys.length
			? dynamicKeys
			: staticKeys.length
				? staticKeys
				: dynamicKeys;
	selected.push(bucket.shift());
}
export function fixture(s) {
	const ls = locales.slice(0, s.localeCount);
	const entries = selected.slice(0, s.total).map((sourceKey, i) => ({
		key: `msg${String(i).padStart(5, "0")}`,
		sourceKey,
		ns: i < 20 ? "common" : `route${(i - 20) % 5}`,
		values: Object.fromEntries(ls.map((l) => [l, raw[l][sourceKey]])),
		inputs: Object.fromEntries(
			params(raw.en[sourceKey]).map((p) => [p, p === "count" ? 3 : "Ada"])
		),
	}));
	if (entries.length !== s.total)
		throw Error("Insufficient real corpus messages");
	const routes = Array.from({ length: 5 }, (_, i) => [
		...entries.filter((e) => e.ns === "common"),
		...entries.filter((e) => e.ns === `route${i}`).slice(0, s.used - 20),
	]);
	if (routes.some((r) => r.length !== s.used))
		throw Error("Insufficient route messages");
	return { locales: ls, entries, routes };
}
export function expectedText(entry, locale) {
	return entry.values[locale].replace(/{{\s*(\w+)\s*}}/g, (_, p) =>
		String(entry.inputs[p])
	);
}
// Small conformance fixture for actual plural category behavior, independent
// of which production messages the deterministic sample happens to select.
export const pluralForms = {
	en: { one: "{{count}} appointment", other: "{{count}} appointments" },
	de: { one: "{{count}} Termin", other: "{{count}} Termine" },
	es: { one: "{{count}} cita", other: "{{count}} citas" },
	fr: {
		one: "{{count}} rendez-vous",
		many: "{{count}} rendez-vous",
		other: "{{count}} rendez-vous",
	},
	it: {
		one: "{{count}} appuntamento",
		many: "{{count}} appuntamenti",
		other: "{{count}} appuntamenti",
	},
	pt: {
		one: "{{count}} agendamento",
		many: "{{count}} agendamentos",
		other: "{{count}} agendamentos",
	},
	nl: { one: "{{count}} afspraak", other: "{{count}} afspraken" },
	pl: {
		one: "{{count}} spotkanie",
		few: "{{count}} spotkania",
		many: "{{count}} spotkań",
		other: "{{count}} spotkania",
	},
	ja: { other: "{{count}}件の予約" },
	ar: {
		zero: "{{count}} موعد",
		one: "{{count}} موعد",
		two: "{{count}} موعدان",
		few: "{{count}} مواعيد",
		many: "{{count}} موعدًا",
		other: "{{count}} موعد",
	},
};
export function pluralText(locale, count) {
	const category = new Intl.PluralRules(locale).select(count);
	return (pluralForms[locale][category] ?? pluralForms[locale].other).replace(
		"{{count}}",
		String(count)
	);
}
