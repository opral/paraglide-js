import { getLocale } from "./get-locale.js";

const rtlLanguages = new Set([
	"ar",
	"dv",
	"fa",
	"he",
	"ks",
	"ku",
	"ps",
	"sd",
	"ug",
	"ur",
	"yi",
]);

/**
 * Get writing direction for a locale.
 *
 * Uses `Intl.Locale` text info when available and falls back to a
 * language-based RTL check for runtimes without `getTextInfo()`.
 *
 * @example
 *   getTextDirection(); // "ltr" or "rtl" for current locale
 *   getTextDirection("ar"); // "rtl"
 *   getTextDirection("en"); // "ltr"
 *
 * @param {string} [locale] - Target locale. If not provided, uses `getLocale()`
 * @returns {"ltr" | "rtl"}
 */
export function getTextDirection(locale = getLocale()) {
	try {
		const intlLocale = /** @type {Intl.Locale & {
			getTextInfo?: () => { direction?: string };
			textInfo?: { direction?: string };
		}} */ (new Intl.Locale(locale));
		const direction =
			intlLocale.getTextInfo?.().direction ?? intlLocale.textInfo?.direction;

		if (direction === "ltr" || direction === "rtl") {
			return direction;
		}
	} catch {
		// Ignore Intl.Locale parsing/runtime errors and use fallback below.
	}

	const language = locale.split("-")[0]?.toLowerCase();
	return rtlLanguages.has(language ?? "") ? "rtl" : "ltr";
}
