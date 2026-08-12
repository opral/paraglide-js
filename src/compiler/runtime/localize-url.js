import { extractLocaleFromUrl } from "./extract-locale-from-url.js";
import { getLocale } from "./get-locale.js";
import { getUrlOrigin } from "./get-url-origin.js";
import { assertIsLocale, toLocale } from "./check-locale.js";
import {
	baseLocale,
	TREE_SHAKE_DEFAULT_URL_PATTERN_USED,
	urlPatterns,
} from "./variables.js";

/**
 * Lower-level URL localization function, primarily used in server contexts.
 *
 * This function is designed for server-side usage where you need precise control
 * over URL localization, such as in middleware or request handlers. It works with
 * URL objects and always returns absolute URLs.
 *
 * For client-side UI components, use `localizeHref()` instead, which provides
 * a more convenient API with relative paths and automatic locale detection.
 *
 * @see https://paraglidejs.com/i18n-routing
 *
 * @example
 * ```typescript
 * // Server middleware example
 * app.use((req, res, next) => {
 *   const url = new URL(req.url, `${req.protocol}://${req.headers.host}`);
 *   const localized = localizeUrl(url, { locale: "de" });
 *
 *   if (localized.href !== url.href) {
 *     return res.redirect(localized.href);
 *   }
 *   next();
 * });
 * ```
 *
 * @example
 * ```typescript
 * // Using with URL patterns
 * const url = new URL("https://example.com/about");
 * localizeUrl(url, { locale: "de" });
 * // => URL("https://example.com/de/about")
 *
 * // Using with domain-based localization
 * const url = new URL("https://example.com/store");
 * localizeUrl(url, { locale: "de" });
 * // => URL("https://de.example.com/store")
 * ```
 *
 * @param {string | URL} url - The URL to localize. If string, must be absolute.
 * @param {object} [options] - Options for localization
 * @param {Locale} [options.locale] - Target locale. If not provided, uses getLocale()
 * @returns {URL} The localized URL, always absolute
 */
export function localizeUrl(url, options) {
	const targetLocale = options?.locale
		? assertIsLocale(options?.locale)
		: getLocale();

	if (TREE_SHAKE_DEFAULT_URL_PATTERN_USED) {
		return localizeUrlDefaultPattern(url, targetLocale);
	}

	const urlObj = typeof url === "string" ? new URL(url) : url;

	// Iterate over URL patterns
	for (const element of urlPatterns) {
		// Most applications use a locale prefix (and sometimes a fixed domain)
		// with a trailing catch-all path. Those routes do not need URLPattern's
		// parser or matcher on every call. Keep the generic matcher below as the
		// fallback for every other URLPattern shape. This stays inside the outer
		// loop so specific patterns retain precedence over a later catch-all.
		const fastPathLocalized = localizeUrlFastPath(
			urlObj,
			targetLocale,
			element
		);
		if (fastPathLocalized !== undefined) {
			return fastPathLocalized;
		}

		// match localized patterns
		for (const [, localizedPattern] of element.localized) {
			const match = getUrlPattern(localizedPattern, urlObj).exec(urlObj.href);

			if (!match) {
				continue;
			}

			const targetPattern = element.localized.find(
				([locale]) => locale === targetLocale
			)?.[1];

			if (!targetPattern) {
				continue;
			}

			const localizedUrl = fillPattern(
				targetPattern,
				aggregateGroups(match),
				urlObj.origin
			);
			return fillMissingUrlParts(localizedUrl, match);
		}
		const unlocalizedMatch = getUrlPattern(element.pattern, urlObj).exec(
			urlObj.href
		);
		if (unlocalizedMatch) {
			const targetPattern = element.localized.find(
				([locale]) => locale === targetLocale
			)?.[1];
			if (targetPattern) {
				const localizedUrl = fillPattern(
					targetPattern,
					aggregateGroups(unlocalizedMatch),
					urlObj.origin
				);
				return fillMissingUrlParts(localizedUrl, unlocalizedMatch);
			}
		}
	}
	// If no match found, return the original URL
	return urlObj;
}

/**
 * https://github.com/opral/inlang-paraglide-js/issues/381
 *
 * @param {string | URL} url
 * @param {Locale} locale
 * @returns {URL}
 */
function localizeUrlDefaultPattern(url, locale) {
	const urlObj =
		typeof url === "string" ? new URL(url, getUrlOrigin()) : new URL(url);

	const currentLocale = extractLocaleFromUrl(urlObj);

	// If current locale matches target locale, no change needed
	if (currentLocale === locale) {
		return urlObj;
	}

	const pathSegments = urlObj.pathname.split("/").filter(Boolean);

	// If current path starts with a locale, remove it
	if (pathSegments.length > 0 && toLocale(pathSegments[0])) {
		pathSegments.shift();
	}

	// For base locale, don't add prefix
	if (locale === baseLocale) {
		urlObj.pathname = "/" + pathSegments.join("/");
	} else {
		// For other locales, add prefix
		urlObj.pathname = "/" + locale + "/" + pathSegments.join("/");
	}

	return urlObj;
}

/**
 * Low-level URL de-localization function, primarily used in server contexts.
 *
 * This function is designed for server-side usage where you need precise control
 * over URL de-localization, such as in middleware or request handlers. It works with
 * URL objects and always returns absolute URLs.
 *
 * For client-side UI components, use `deLocalizeHref()` instead, which provides
 * a more convenient API with relative paths.
 *
 * @see https://paraglidejs.com/i18n-routing
 *
 * @example
 * ```typescript
 * // Server middleware example
 * app.use((req, res, next) => {
 *   const url = new URL(req.url, `${req.protocol}://${req.headers.host}`);
 *   const baseUrl = deLocalizeUrl(url);
 *
 *   // Store the base URL for later use
 *   req.baseUrl = baseUrl;
 *   next();
 * });
 * ```
 *
 * @example
 * ```typescript
 * // Using with URL patterns
 * const url = new URL("https://example.com/de/about");
 * deLocalizeUrl(url); // => URL("https://example.com/about")
 *
 * // Using with domain-based localization
 * const url = new URL("https://de.example.com/store");
 * deLocalizeUrl(url); // => URL("https://example.com/store")
 * ```
 *
 * @param {string | URL} url - The URL to de-localize. If string, must be absolute.
 * @returns {URL} The de-localized URL, always absolute
 */
export function deLocalizeUrl(url) {
	if (TREE_SHAKE_DEFAULT_URL_PATTERN_USED) {
		return deLocalizeUrlDefaultPattern(url);
	}

	const urlObj = typeof url === "string" ? new URL(url) : url;

	// Iterate over URL patterns
	for (const element of urlPatterns) {
		const fastPathDeLocalized = deLocalizeUrlFastPath(urlObj, element);
		if (fastPathDeLocalized !== undefined) {
			return fastPathDeLocalized;
		}

		// Iterate over localized versions
		for (const [, localizedPattern] of element.localized) {
			const match = getUrlPattern(localizedPattern, urlObj).exec(urlObj.href);

			if (match) {
				// Convert localized URL back to the base pattern
				const groups = aggregateGroups(match);

				const baseUrl = fillPattern(element.pattern, groups, urlObj.origin);
				return fillMissingUrlParts(baseUrl, match);
			}
		}
		// match unlocalized pattern
		const unlocalizedMatch = getUrlPattern(element.pattern, urlObj).exec(
			urlObj.href
		);
		if (unlocalizedMatch) {
			const baseUrl = fillPattern(
				element.pattern,
				aggregateGroups(unlocalizedMatch),
				urlObj.origin
			);
			return fillMissingUrlParts(baseUrl, unlocalizedMatch);
		}
	}
	// no match found return the original url
	return urlObj;
}

/**
 * De-localizes a URL using the default pattern (/:locale/*)
 * @param {string|URL} url
 * @returns {URL}
 */
function deLocalizeUrlDefaultPattern(url) {
	const urlObj =
		typeof url === "string" ? new URL(url, getUrlOrigin()) : new URL(url);
	const pathSegments = urlObj.pathname.split("/").filter(Boolean);

	// If first segment is a locale, remove it
	if (pathSegments.length > 0 && toLocale(pathSegments[0])) {
		urlObj.pathname = "/" + pathSegments.slice(1).join("/");
	}

	return urlObj;
}

/**
 * Takes matches of implicit wildcards in the UrlPattern (when a part is missing
 * it is equal to '*') and adds them back to the result of fillPattern.
 *
 * At least protocol and hostname are required to create a valid URL inside fillPattern.
 *
 * @param {URL} url
 * @param {any} match
 * @returns {URL}
 */
function fillMissingUrlParts(url, match) {
	if (match.protocol.groups["0"]) {
		url.protocol = match.protocol.groups["0"] ?? "";
	}
	if (match.hostname.groups["0"]) {
		url.hostname = match.hostname.groups["0"] ?? "";
	}
	if (match.username.groups["0"]) {
		url.username = match.username.groups["0"] ?? "";
	}
	if (match.password.groups["0"]) {
		url.password = match.password.groups["0"] ?? "";
	}
	if (match.port.groups["0"]) {
		url.port = match.port.groups["0"] ?? "";
	}
	if (match.pathname.groups["0"]) {
		url.pathname = match.pathname.groups["0"] ?? "";
	}
	if (match.search.groups["0"]) {
		url.search = match.search.groups["0"] ?? "";
	}
	if (match.hash.groups["0"]) {
		url.hash = match.hash.groups["0"] ?? "";
	}

	return url;
}

/**
 * Fills a URL pattern with values for named groups, supporting all URLPattern-style modifiers.
 *
 * This function will eventually be replaced by https://github.com/whatwg/urlpattern/issues/73
 *
 * Matches:
 * - :name        -> Simple
 * - :name?       -> Optional
 * - :name+       -> One or more
 * - :name*       -> Zero or more
 * - :name(...)   -> Regex group
 * - {text}       -> Group delimiter
 * - {text}?      -> Optional group delimiter
 *
 * If the value is `null`, the segment is removed.
 *
 * @param {string} pattern - The URL pattern containing named groups.
 * @param {Record<string, string | null | undefined>} values - Object of values for named groups.
 * @param {string} origin - Base URL to use for URL construction.
 * @returns {URL} - The constructed URL with named groups filled.
 */
function fillPattern(pattern, values, origin) {
	// Pre-process the pattern to handle explicit port numbers
	// This detects patterns like "http://localhost:5173" and protects the port number
	// from being interpreted as a parameter
	let processedPattern = pattern.replace(
		/(https?:\/\/[^:/]+):(\d+)(\/|$)/g,
		(_, protocol, port, slash) => {
			// Replace ":5173" with "#PORT-5173#" to protect it from parameter replacement
			return `${protocol}#PORT-${port}#${slash}`;
		}
	);

	// First, handle group delimiters with curly braces
	let processedGroupDelimiters = processedPattern.replace(
		/\{([^{}]*)\}([?+*]?)/g,
		(_, content, modifier) => {
			// For optional group delimiters
			if (modifier === "?") {
				// For optional groups, we'll include the content
				return content;
			}
			// For non-optional group delimiters, always include the content
			return content;
		}
	);

	// Then handle named groups
	let filled = processedGroupDelimiters.replace(
		/(\/?):([a-zA-Z0-9_]+)(\([^)]*\))?([?+*]?)/g,
		(_, slash, name, __, modifier) => {
			const value = values[name];

			if (value === null) {
				// If value is null, remove the entire segment including the preceding slash
				return "";
			}

			if (modifier === "?") {
				// Optional segment
				return value !== undefined ? `${slash}${value}` : "";
			}

			if (modifier === "+" || modifier === "*") {
				// Repeatable segments
				if (value === undefined && modifier === "+") {
					throw new Error(`Missing value for "${name}" (one or more required)`);
				}
				return value ? `${slash}${value}` : "";
			}

			// Simple named group (no modifier)
			if (value === undefined) {
				throw new Error(`Missing value for "${name}"`);
			}

			return `${slash}${value}`;
		}
	);

	// Restore port numbers
	filled = filled.replace(/#PORT-(\d+)#/g, ":$1");

	return new URL(filled, origin);
}

/**
 * Aggregates named groups from various parts of the URLPattern match result.
 *
 *
 * @param {any} match - The URLPattern match result object.
 * @returns {Record<string, string | null | undefined>} An object containing all named groups from the match.
 */
export function aggregateGroups(match) {
	return {
		...match.hash.groups,
		...match.hostname.groups,
		...match.password.groups,
		...match.pathname.groups,
		...match.port.groups,
		...match.protocol.groups,
		...match.search.groups,
		...match.username.groups,
	};
}

/** @type {Map<string, URLPattern>} */
const urlPatternCache = new Map();

const URL_PATTERN_CACHE_LIMIT = 128;
const ABSOLUTE_URL_PATTERN = /^[A-Za-z][A-Za-z\d+.-]*:\/\//;

/**
 * URLPattern's base URL affects relative patterns. Absolute patterns only
 * depend on the pattern itself, while root-relative patterns also depend on
 * the URL origin. Other relative patterns are deliberately not cached because
 * their semantics depend on the complete base URL.
 *
 * @param {string} pattern
 * @param {URL} url
 * @returns {URLPattern}
 */
function getUrlPattern(pattern, url) {
	const isAbsolutePattern = ABSOLUTE_URL_PATTERN.test(pattern);
	const isRootRelativePattern = pattern.startsWith("/");
	if (!isAbsolutePattern && !isRootRelativePattern) {
		return new URLPattern(pattern, url.href);
	}

	const key = isAbsolutePattern
		? pattern
		: JSON.stringify([url.origin, pattern]);
	const cached = urlPatternCache.get(key);
	if (cached !== undefined) {
		// Refresh the entry so frequently used patterns stay in the bounded cache.
		urlPatternCache.delete(key);
		urlPatternCache.set(key, cached);
		return cached;
	}

	const compiled = new URLPattern(pattern, url.href);
	if (urlPatternCache.size >= URL_PATTERN_CACHE_LIMIT) {
		const oldestKey = urlPatternCache.keys().next().value;
		if (oldestKey !== undefined) urlPatternCache.delete(oldestKey);
	}
	urlPatternCache.set(key, compiled);
	return compiled;
}

/**
 * A small, deliberately conservative subset of URLPattern routing.
 *
 * The compiler emits routes such as `/:path(.*)?`, `/de/:path*`, or
 * `https://example.com/:path*`. For those routes matching is equivalent to a
 * pathname prefix check and (optionally) an origin check. Everything that has
 * a dynamic host, a custom path regexp, or another URLPattern modifier keeps
 * using the generic implementation above.
 *
 * @typedef {{
 *   protocol: string | undefined;
 *   hostname: string | undefined;
 *   port: string | undefined;
 *   pathnamePrefix: string;
 *   pathMode: "segments" | "catch-all-optional" | "catch-all-required";
 * }} FastPathPattern
 * @typedef {{
 *   base: FastPathPattern;
 *   localized: Array<{ locale: string; pattern: FastPathPattern }>;
 * }} FastPathRoute
 */

/** @type {WeakMap<object, FastPathRoute | null>} */
const fastPathRouteCache = new WeakMap();

/**
 * @param {URL} urlObj
 * @param {string} targetLocale
 * @param {{ pattern: string; localized: Array<[string, string]> }} element
 * @returns {URL | undefined}
 */
function localizeUrlFastPath(urlObj, targetLocale, element) {
	const route = getFastPathRoute(element);
	if (route === null) return undefined;

	// Preserve URLPattern's ordering: localized patterns are checked before
	// the unlocalized pattern, and the first matching pattern wins.
	for (const localized of route.localized) {
		const suffix = matchFastPathPattern(localized.pattern, urlObj);
		if (suffix === undefined) continue;

		const target = route.localized.find(
			(candidate) => candidate.locale === targetLocale
		)?.pattern;
		if (target === undefined) continue;

		return applyFastPathPattern(target, suffix, urlObj);
	}

	const suffix = matchFastPathPattern(route.base, urlObj);
	if (suffix !== undefined) {
		const target = route.localized.find(
			(candidate) => candidate.locale === targetLocale
		)?.pattern;
		if (target !== undefined) {
			return applyFastPathPattern(target, suffix, urlObj);
		}
	}

	return undefined;
}

/**
 * @param {URL} urlObj
 * @param {{ pattern: string; localized: Array<[string, string]> }} element
 * @returns {URL | undefined}
 */
function deLocalizeUrlFastPath(urlObj, element) {
	const route = getFastPathRoute(element);
	if (route === null) return undefined;

	for (const localized of route.localized) {
		const suffix = matchFastPathPattern(localized.pattern, urlObj);
		if (suffix !== undefined) {
			return applyFastPathPattern(route.base, suffix, urlObj);
		}
	}

	const suffix = matchFastPathPattern(route.base, urlObj);
	if (suffix !== undefined) {
		return applyFastPathPattern(route.base, suffix, urlObj);
	}

	return undefined;
}

/**
 * @param {{ pattern: string; localized: Array<[string, string]> }} element
 * @returns {FastPathRoute | null}
 */
function getFastPathRoute(element) {
	const cached = fastPathRouteCache.get(element);
	if (cached !== undefined) return cached;

	const base = parseFastPathPattern(element.pattern);
	if (base === undefined) {
		fastPathRouteCache.set(element, null);
		return null;
	}

	const localized = [];
	for (const [locale, pattern] of element.localized) {
		const parsed = parseFastPathPattern(pattern);
		if (parsed === undefined || parsed.pathMode !== base.pathMode) {
			fastPathRouteCache.set(element, null);
			return null;
		}
		localized.push({ locale, pattern: parsed });
	}

	const route = { base, localized };
	fastPathRouteCache.set(element, route);
	return route;
}

/**
 * Parse only catch-all path patterns. In particular, do not treat `:path(.)?`
 * as a catch-all: URLPattern's `(.)` means exactly one character and cannot be
 * represented by this prefix matcher without changing routing semantics.
 *
 * @param {string} pattern
 * @returns {FastPathPattern | undefined}
 */
function parseFastPathPattern(pattern) {
	const wildcard = pattern.match(/\/:path(?:\(\.\*\)(?:\?)?|\*)$/);
	if (wildcard === null || wildcard.index === undefined) return undefined;

	const prefix = pattern.slice(0, wildcard.index);
	const originAndPath = parseFastPathOriginAndPath(prefix);
	if (originAndPath === undefined) return undefined;
	const pathMode = wildcard[0].endsWith("*")
		? "segments"
		: wildcard[0].endsWith("?")
			? "catch-all-optional"
			: "catch-all-required";

	return { ...originAndPath, pathMode };
}

/**
 * @param {string} prefix
 * @returns {FastPathPattern | undefined}
 */
function parseFastPathOriginAndPath(prefix) {
	if (prefix === "" || prefix.startsWith("/")) {
		if (hasUrlPatternSyntax(prefix)) return undefined;
		return {
			protocol: undefined,
			hostname: undefined,
			port: undefined,
			pathnamePrefix: normalizePathPrefix(prefix),
			pathMode: "catch-all-optional",
		};
	}

	// A `:protocol://host` pattern is common in generated configurations. The
	// protocol is intentionally left unconstrained, just like URLPattern.
	const dynamicProtocol = prefix.match(/^:protocol:\/\/([^/]+)(\/.*)?$/);
	const staticOrigin = prefix.match(
		/^([A-Za-z][A-Za-z\d+.-]*):\/\/([^/]+)(\/.*)?$/
	);
	if (dynamicProtocol !== null) {
		const dynamicHost = dynamicProtocol[1] ?? "";
		const hostMatch = dynamicHost.match(/^([^:(){}?*+]+)(?::(\d+))?$/);
		if (
			hostMatch === null ||
			(dynamicProtocol[2] !== undefined &&
				hasUrlPatternSyntax(dynamicProtocol[2]))
		) {
			return undefined;
		}
		return {
			protocol: undefined,
			hostname: (hostMatch[1] ?? "").toLowerCase(),
			port: hostMatch[2],
			pathnamePrefix: normalizePathPrefix(dynamicProtocol[2] ?? ""),
			pathMode: "catch-all-optional",
		};
	}

	if (staticOrigin === null) return undefined;

	const host = staticOrigin[2] ?? "";
	const pathname = staticOrigin[3];
	const hostMatch = host.match(/^([^:(){}?*+]+)(?::(\d+))?$/);
	if (
		hostMatch === null ||
		(pathname !== undefined && hasUrlPatternSyntax(pathname))
	) {
		return undefined;
	}

	return {
		protocol: `${staticOrigin[1]}:`,
		hostname: (hostMatch[1] ?? "").toLowerCase(),
		port: normalizePatternPort(hostMatch[2], `${staticOrigin[1]}:`),
		pathnamePrefix: normalizePathPrefix(pathname ?? ""),
		pathMode: "catch-all-optional",
	};
}

/**
 * @param {string | undefined} port
 * @param {string} protocol
 * @returns {string | undefined}
 */
function normalizePatternPort(port, protocol) {
	if (port === "80" && protocol === "http:") return "";
	if (port === "443" && protocol === "https:") return "";
	return port;
}

/**
 * @param {string} value
 * @returns {boolean}
 */
function hasUrlPatternSyntax(value) {
	return /[:(){}?*+]/.test(value);
}

/**
 * @param {string} pathname
 * @returns {string}
 */
function normalizePathPrefix(pathname) {
	if (pathname === "" || pathname === "/") return "/";
	return pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
}

/**
 * @param {FastPathPattern} pattern
 * @param {URL} urlObj
 * @returns {string | undefined}
 */
function matchFastPathPattern(pattern, urlObj) {
	if (pattern.protocol !== undefined && pattern.protocol !== urlObj.protocol) {
		return undefined;
	}
	if (
		pattern.hostname !== undefined &&
		pattern.hostname !== urlObj.hostname.toLowerCase()
	) {
		return undefined;
	}
	if (pattern.hostname !== undefined) {
		const expectedPort =
			pattern.port ?? defaultPortForProtocol(pattern.protocol ?? urlObj.protocol);
		if (expectedPort !== urlObj.port) return undefined;
	}

	const prefix = pattern.pathnamePrefix;
	if (prefix === "/") {
		if (urlObj.pathname.startsWith("//")) return undefined;
		if (pattern.pathMode === "segments") {
			return isNonEmptyPathSegments(urlObj.pathname)
				? urlObj.pathname
				: undefined;
		}
		return urlObj.pathname;
	}
	if (urlObj.pathname === prefix) {
		return pattern.pathMode === "catch-all-required" ? undefined : "";
	}
	if (urlObj.pathname.startsWith(`${prefix}/`)) {
		const suffix = urlObj.pathname.slice(prefix.length);
		if (suffix.startsWith("//")) return undefined;
		if (
			pattern.pathMode === "segments" &&
			!isNonEmptyPathSegments(suffix)
		) {
			return undefined;
		}
		return suffix;
	}
	return undefined;
}

/**
 * @param {string} pathname
 * @returns {boolean}
 */
function isNonEmptyPathSegments(pathname) {
	return pathname.length > 1 && !pathname.endsWith("/") && !pathname.includes("//");
}

/**
 * URLPattern treats the default port as empty in URL instances.
 *
 * @param {string} protocol
 * @returns {string}
 */
function defaultPortForProtocol(protocol) {
	if (protocol === "http:") return "";
	if (protocol === "https:") return "";
	return "";
}

/**
 * @param {FastPathPattern} pattern
 * @param {string} suffix
 * @param {URL} source
 * @returns {URL}
 */
function applyFastPathPattern(pattern, suffix, source) {
	const localized = new URL(source.href);
	if (pattern.protocol !== undefined) localized.protocol = pattern.protocol;
	if (pattern.hostname !== undefined) {
		localized.hostname = pattern.hostname;
		localized.port =
			pattern.port ?? defaultPortForProtocol(localized.protocol);
	}
	localized.pathname = joinFastPathPrefix(pattern.pathnamePrefix, suffix);
	return localized;
}

/**
 * @param {string} prefix
 * @param {string} suffix
 * @returns {string}
 */
function joinFastPathPrefix(prefix, suffix) {
	if (prefix === "/") return suffix === "" ? "/" : suffix;
	if (suffix === "") return prefix;
	return `${prefix}${suffix.startsWith("/") ? suffix : `/${suffix}`}`;
}
