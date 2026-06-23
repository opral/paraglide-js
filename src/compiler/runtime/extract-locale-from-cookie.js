import { toLocale } from "./check-locale.js";
import { cookieName } from "./variables.js";

const cookieNamePattern = cookieName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const localeCookiePattern = new RegExp(
	`(?:^|;\\s*)${cookieNamePattern}=([^;]*)`
);

const noCachedLocale = Symbol();
/** @type {Locale | undefined | typeof noCachedLocale} */
let cachedLocaleFromCookie = noCachedLocale;

/**
 * Clears the cached locale from `document.cookie`.
 */
export function clearLocaleCookieCache() {
	cachedLocaleFromCookie = noCachedLocale;
}

function scheduleLocaleCookieCacheClear() {
	if (typeof queueMicrotask === "function") {
		queueMicrotask(clearLocaleCookieCache);
	} else {
		Promise.resolve().then(clearLocaleCookieCache);
	}
}

/**
 * Extracts a cookie from the document.
 *
 * Will return undefined if the document is not available or if the cookie is not set.
 * The `document` object is not available in server-side rendering, so this function should not be called in that context.
 *
 * @returns {Locale | undefined}
 */
export function extractLocaleFromCookie() {
	if (typeof document === "undefined") {
		return;
	}
	if (cachedLocaleFromCookie !== noCachedLocale) {
		return cachedLocaleFromCookie;
	}
	const match = document.cookie.match(localeCookiePattern);
	const locale = match?.[1];
	cachedLocaleFromCookie = toLocale(locale);
	scheduleLocaleCookieCacheClear();
	return cachedLocaleFromCookie;
}
