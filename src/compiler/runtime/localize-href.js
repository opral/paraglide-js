import { getLocale } from "./get-locale.js";
import { getUrlOrigin } from "./get-url-origin.js";
import { deLocalizeUrl, localizeUrl } from "./localize-url.js";

/**
 * High-level URL localization function optimized for client-side UI usage.
 *
 * This is a convenience wrapper around `localizeUrl()` that provides features
 * needed in UI:
 *
 * - Accepts relative paths (e.g., "/about")
 * - Returns relative paths when possible
 * - Automatically detects current locale if not specified
 * - Handles string input/output instead of URL objects
 *
 * @see https://paraglidejs.com/i18n-routing
 *
 * @example
 * ```typescript
 * // In a React/Vue/Svelte component
 * const NavLink = ({ href }) => {
 *   // Automatically uses current locale, keeps path relative
 *   return <a href={localizeHref(href)}>...</a>;
 * };
 *
 * // Examples:
 * localizeHref("/about")
 * // => "/de/about" (if current locale is "de")
 * localizeHref("/store", { locale: "fr" })
 * // => "/fr/store" (explicit locale)
 *
 * // Cross-origin links remain absolute
 * localizeHref("https://other-site.com/about")
 * // => "https://other-site.com/de/about"
 *
 * // Protocol-relative links stay protocol-relative
 * localizeHref("//other-site.com/about")
 * // => "//other-site.com/de/about"
 * ```
 *
 * For server-side URL localization (e.g., in middleware), use `localizeUrl()`
 * which provides more precise control over URL handling.
 *
 * @param {string} href - The href to localize (can be relative or absolute)
 * @param {object} [options] - Options for localization
 * @param {Locale} [options.locale] - Target locale. If not provided, uses `getLocale()`
 * @returns {string} The localized href, relative if input was relative
 */
export function localizeHref(href, options) {
	const currentLocale = getLocale();
	const locale = options?.locale ?? currentLocale;
	const url = new URL(href, getUrlOrigin());

	const localized = localizeUrl(url, { locale });

	const protocolRelativeHref = serializeProtocolRelativeHref(
		href,
		url,
		localized
	);
	if (protocolRelativeHref !== undefined) {
		return protocolRelativeHref;
	}

	// if the origin is identical and the href is relative,
	// return the relative path
	if (href.startsWith("/") && url.origin === localized.origin) {
		// check for cross origin localization in which case an absolute URL must be returned.
		if (locale !== currentLocale) {
			const localizedCurrentLocale = localizeUrl(url, {
				locale: currentLocale,
			});
			if (localizedCurrentLocale.origin !== localized.origin) {
				return localized.href;
			}
		}
		return localized.pathname + localized.search + localized.hash;
	}

	return localized.href;
}

/**
 * High-level URL de-localization function optimized for client-side UI usage.
 *
 * This is a convenience wrapper around `deLocalizeUrl()` that provides features
 * needed in the UI:
 *
 * - Accepts relative paths (e.g., "/de/about")
 * - Returns relative paths when possible
 * - Handles string input/output instead of URL objects
 *
 * @see https://paraglidejs.com/i18n-routing
 *
 * @example
 * ```typescript
 * // In a React/Vue/Svelte component
 * const LocaleSwitcher = ({ href }) => {
 *   // Remove locale prefix before switching
 *   const baseHref = deLocalizeHref(href);
 *   return locales.map(locale =>
 *     <a href={localizeHref(baseHref, { locale })}>
 *       Switch to {locale}
 *     </a>
 *   );
 * };
 *
 * // Examples:
 * deLocalizeHref("/de/about")  // => "/about"
 * deLocalizeHref("/fr/store")  // => "/store"
 *
 * // Cross-origin links remain absolute
 * deLocalizeHref("https://example.com/de/about")
 * // => "https://example.com/about"
 *
 * // Protocol-relative links stay protocol-relative
 * deLocalizeHref("//example.com/de/about")
 * // => "//example.com/about"
 * ```
 *
 * For server-side URL de-localization (e.g., in middleware), use `deLocalizeUrl()`
 * which provides more precise control over URL handling.
 *
 * @param {string} href - The href to de-localize (can be relative or absolute)
 * @returns {string} The de-localized href, relative if input was relative
 */
export function deLocalizeHref(href) {
	const url = new URL(href, getUrlOrigin());

	const deLocalized = deLocalizeUrl(url);

	const protocolRelativeHref = serializeProtocolRelativeHref(
		href,
		url,
		deLocalized
	);
	if (protocolRelativeHref !== undefined) {
		return protocolRelativeHref;
	}

	// If the origin is identical and the href is relative,
	// return the relative path instead of the full URL.
	if (href.startsWith("/") && url.origin === deLocalized.origin) {
		return deLocalized.pathname + deLocalized.search + deLocalized.hash;
	}

	return deLocalized.href;
}

/**
 * @param {string} href
 * @param {URL} url
 * @param {URL} localized
 * @returns {string | undefined} The serialized href, or undefined if it is not protocol-relative.
 */
function serializeProtocolRelativeHref(href, url, localized) {
	const first = href.charCodeAt(0);
	const second = href.charCodeAt(1);
	if (first > 0x20 && first !== 0x2f && first !== 0x5c) return undefined;
	if (first === 0x2f && second > 0x20 && second !== 0x2f && second !== 0x5c)
		return undefined;

	// URL parsing removes tabs/newlines and trims leading C0 controls and spaces.
	const normalizedHref = href.replace(/[\t\n\r]/g, "");
	let start = 0;
	while (normalizedHref.charCodeAt(start) <= 0x20) start++;
	let end = normalizedHref.length;
	while (end > start && normalizedHref.charCodeAt(end - 1) <= 0x20) end--;
	const relativeHref = normalizedHref.slice(start, end);
	// Special schemes also treat backslashes as authority separators.
	const specialScheme = /^(https?|wss?|ftp|file):$/.test(url.protocol);
	const separators = specialScheme ? /^[/\\]{2}/ : /^\/\//;
	if (!separators.test(relativeHref)) return undefined;

	// Keep configured protocol and port changes independent of the page's scheme.
	if (localized.protocol !== url.protocol || localized.port !== url.port) {
		return localized.href;
	}

	// Otherwise leave the scheme to the page, including outside server middleware.
	const result = localized.href.slice(localized.protocol.length);
	if (localized.port || url.protocol === "file:" || !url.hostname)
		return result;

	// URL drops default ports. Recover an explicit port from the original authority.
	const authority = (
		specialScheme ? relativeHref.replace(/^[/\\]+/, "") : relativeHref.slice(2)
	).split(specialScheme ? /[/\\?#]/ : /[/?#]/, 1)[0];
	const port = authority?.match(/:(\d+)$/)?.[1];
	if (port === undefined) return result;
	const pathStart = result.indexOf("/", 2);
	const authorityEnd = pathStart === -1 ? result.length : pathStart;
	return `${result.slice(0, authorityEnd)}:${Number(port)}${result.slice(authorityEnd)}`;
}
