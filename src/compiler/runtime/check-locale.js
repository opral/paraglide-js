import { locales } from "./variables.js";

/**
 * Coerces a locale-like string to the canonical locale value used by the runtime.
 *
 * @param {unknown} value
 * @returns {Locale | undefined}
 */
export function toLocale(value) {
	if (typeof value !== "string") {
		return undefined;
	}

	const lowerValue = value.toLowerCase();
	for (const locale of locales) {
		if (locale.toLowerCase() === lowerValue) {
			return locale;
		}
	}
	return undefined;
}

/**
 * Check if something is an available locale with the canonical project casing.
 *
 * @example
 *   if (isLocale(params.locale)) {
 *     setLocale(params.locale);
 *   } else {
 *     setLocale('en');
 *   }
 *
 * Use `toLocale()` when you want case-insensitive matching and canonicalization.
 *
 * @param {unknown} locale
 * @returns {locale is Locale}
 */
export function isLocale(locale) {
	return !!locale && locales.some((item) => item === locale);
}

/**
 * Asserts that the input is a locale.
 *
 * @param {unknown} input - The input to check.
 * @returns {Locale} The input if it is a locale.
 * @throws {Error} If the input is not a locale.
 */
export function assertIsLocale(input) {
	if (typeof input !== "string") {
		throw new Error(`Invalid locale: ${input}. Expected a string.`);
	}
	const matchedLocale = toLocale(input);
	if (!matchedLocale) {
		throw new Error(
			`Invalid locale: ${input}. Expected one of: ${locales.join(", ")}`
		);
	}
	return matchedLocale;
}
