import { locales } from "./variables.js";

// @ts-ignore a bug in tsc marks this as unused, it's fixed in tsgo (typescript 7.0)
/** @import {Locale} from "./type-definitions.js" */

/**
 * Check if something is an available locale.
 *
 * @example
 *   if (isLocale(params.locale)) {
 *     setLocale(params.locale);
 *   } else {
 *     setLocale('en');
 *   }
 *
 *
 * @param {unknown} locale
 * @returns {locale is Locale}
 */
export function isLocale(locale) {
	if (typeof locale !== "string") return false;
	return !locale
		? false
		: locales.some((item) => item.toLowerCase() === locale.toLowerCase());
}
