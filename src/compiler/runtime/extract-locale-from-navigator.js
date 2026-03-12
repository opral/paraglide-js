import { toLocale } from "./check-locale.js";

/**
 * Negotiates a preferred language from navigator.languages.
 *
 * Use the function on the client to extract the locale
 * from the navigator.languages array.
 *
 * @example
 *   const locale = extractLocaleFromNavigator();
 *
 * @returns {Locale | undefined}
 */
export function extractLocaleFromNavigator() {
	if (!navigator?.languages?.length) {
		return undefined;
	}

	const languages = navigator.languages.map((lang) => ({
		fullTag: lang,
		baseTag: lang.split("-")[0],
	}));

	for (const lang of languages) {
		const fullLocale = toLocale(lang.fullTag);
		if (fullLocale) {
			return fullLocale;
		}

		const baseLocale = toLocale(lang.baseTag);
		if (baseLocale) {
			return baseLocale;
		}
	}

	return undefined;
}
