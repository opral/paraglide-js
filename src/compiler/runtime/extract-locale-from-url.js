import { toLocale } from "./check-locale.js";
import {
	baseLocale,
	TREE_SHAKE_DEFAULT_URL_PATTERN_USED,
	urlPatterns,
} from "./variables.js";

/**
 * If extractLocaleFromUrl is called many times on the same page and the URL
 * hasn't changed, we don't need to recompute it every time which can get expensive.
 * We might use a LRU cache if needed, but for now storing only the last result is enough.
 * https://github.com/opral/monorepo/pull/3575#discussion_r2066731243
 */
/** @type {string|undefined} */
let cachedUrl;
/** @type {Locale|undefined} */
let cachedLocale;

/**
 * Extracts the locale from a given URL using native URLPattern.
 *
 * The built-in default `/:locale/...` routing is case-insensitive because it
 * canonicalizes the first path segment with `toLocale()`. Custom `urlPatterns`
 * keep URLPattern's normal exact matching semantics for path segments.
 *
 * @param {URL|string} url - The full URL from which to extract the locale.
 * @returns {Locale|undefined} The extracted locale, or undefined if no locale is found.
 */
export function extractLocaleFromUrl(url) {
	const urlString = typeof url === "string" ? url : url.href;

	if (cachedUrl === urlString) {
		return cachedLocale;
	}

	/** @type {Locale | undefined} */
	let result;
	if (TREE_SHAKE_DEFAULT_URL_PATTERN_USED) {
		result = defaultUrlPatternExtractLocale(url);
	} else {
		const urlObj = typeof url === "string" ? new URL(url) : url;

		// Iterate over URL patterns
		for (const element of urlPatterns) {
			for (const [locale, localizedPattern] of element.localized) {
				const match = new URLPattern(localizedPattern, urlObj.href).exec(
					urlObj.href
				);

				if (match) {
					result = locale;
					break;
				}
			}
			if (result) break;
		}
	}

	cachedUrl = urlString;
	cachedLocale = result;
	return result;
}

/**
 * https://github.com/opral/inlang-paraglide-js/issues/381
 *
 * @param {URL | string} url - The full URL from which to extract the locale.
 * @returns {Locale | undefined} The extracted locale, or undefined if no locale is found.
 */
function defaultUrlPatternExtractLocale(url) {
	const urlObj = new URL(url, "http://dummy.com");
	const pathSegments = urlObj.pathname.split("/").filter(Boolean);
	return toLocale(pathSegments[0]) || baseLocale;
}
