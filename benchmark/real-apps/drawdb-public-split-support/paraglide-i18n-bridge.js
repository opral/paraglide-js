import { useMemo, useSyncExternalStore } from "react";
import { getLocale, locales, setLocale } from "@paraglide/runtime.js";
import { dynamicTranslations } from "virtual:drawdb-paraglide-dynamic-translations";

const subscribers = new Set();
const aliases = {
	ja: "jp",
	cs: "cz",
	ta: "tm",
	or: "od",
	pt: "pt-BR",
	sv: "sv",
};
const canonicalLocale = new Map(
	locales.map((locale) => [locale.toLowerCase(), locale])
);

function resolveLocale(value) {
	if (typeof value !== "string") return "en";
	const normalized = value.trim().replaceAll("_", "-").toLowerCase();
	const alias = aliases[normalized] ?? aliases[normalized.split("-")[0]];
	const direct =
		canonicalLocale.get(normalized) ??
		(alias && canonicalLocale.get(alias.toLowerCase()));
	if (direct) return direct;
	const base = normalized.split("-")[0];
	return (
		canonicalLocale.get(base) ??
		canonicalLocale.get(aliases[base]?.toLowerCase()) ??
		"en"
	);
}

function detectedLocale() {
	if (typeof window === "undefined") return "en";
	const queryLocale = new URLSearchParams(window.location.search).get("lng");
	if (queryLocale) return resolveLocale(queryLocale);
	const cookie = document.cookie
		.split(";")
		.map((entry) => entry.trim())
		.find((entry) => entry.startsWith("i18next="))
		?.slice("i18next=".length);
	if (cookie) return resolveLocale(decodeURIComponent(cookie));
	try {
		const storedLocale = window.localStorage.getItem("i18nextLng");
		if (storedLocale) return resolveLocale(storedLocale);
	} catch {
		// Storage can be unavailable in private browsing contexts.
	}
	try {
		const sessionLocale = window.sessionStorage.getItem("i18nextLng");
		if (sessionLocale) return resolveLocale(sessionLocale);
	} catch {
		// Session storage can also be unavailable.
	}
	return resolveLocale(
		window.navigator.languages?.[0] ?? window.navigator.language
	);
}

let activeLocale = detectedLocale();
setLocale(activeLocale, { reload: false });

function getSnapshot() {
	return activeLocale;
}

function subscribe(callback) {
	subscribers.add(callback);
	return () => subscribers.delete(callback);
}

function notifyLanguageChanged() {
	for (const subscriber of subscribers) subscriber();
}

function translateDynamic(key, inputs = {}) {
	const message = dynamicTranslations[key];
	return message ? message(inputs) : key;
}

const i18n = {
	t: translateDynamic,
	changeLanguage(locale) {
		activeLocale = resolveLocale(locale);
		setLocale(activeLocale, { reload: false });
		try {
			window.localStorage.setItem("i18nextLng", activeLocale);
		} catch {
			// The language still changes for this page if storage is unavailable.
		}
		notifyLanguageChanged();
		return Promise.resolve(activeLocale);
	},
	get language() {
		return activeLocale;
	},
	get resolvedLanguage() {
		return activeLocale;
	},
};

export function useTranslation() {
	const language = useSyncExternalStore(subscribe, getSnapshot, () => "en");
	// i18next returns a language-bound translator identity after languageChanged.
	// Preserve that behavior for callers that cache derived strings by `t`.
	const t = useMemo(
		() => (key, inputs) => translateDynamic(key, inputs),
		[language]
	);
	return { t, i18n };
}

export default i18n;
