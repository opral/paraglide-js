import { getLocale, locales, setLocale } from "../paraglide/runtime.js";
import { transMessages } from "./trans-messages.js";
import { callTranslation } from "./translation-inputs.js";

const listeners = new Set();
let activeLocale = getLocale();

function resolveLocale(locale) {
	if (typeof locale !== "string") return "en";
	const normalized = locale.trim().replaceAll("_", "-").toLowerCase();
	return (
		locales.find((candidate) => candidate.toLowerCase() === normalized) ??
		locales.find((candidate) => candidate.toLowerCase() === normalized.split("-")[0]) ??
		"en"
	);
}

function notify() {
	for (const listener of listeners) listener();
}

export function subscribeLocale(listener) {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

export function localeSnapshot() {
	return activeLocale;
}

export function translateKey(key, options = {}) {
	const fn = transMessages[key];
	if (!fn) return options.defaultValue ?? key;
	return callTranslation(key, fn, options);
}

const rtlLocales = new Set(["ar", "fa", "he"]);
const i18n = {
	ready: Promise.resolve(),
	t: translateKey,
	async changeLanguage(locale) {
		const resolved = resolveLocale(locale);
		await setLocale(resolved, { reload: false });
		activeLocale = getLocale();
		try {
			window.localStorage.setItem("i18nextLng", activeLocale);
		} catch {
			// The current document still uses the resolved locale.
		}
		notify();
		return activeLocale;
	},
	dir() {
		return rtlLocales.has(activeLocale.split("-")[0]) ? "rtl" : "ltr";
	},
	get language() {
		return activeLocale;
	},
	get resolvedLanguage() {
		return activeLocale;
	},
};

export default i18n;
