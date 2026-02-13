/**
 * The project's base locale.
 *
 * @example
 *   if (locale === baseLocale) {
 *     // do something
 *   }
 */
export const baseLocale = "en";

/**
 * The project's locales that have been specified in the settings.
 *
 * @example
 *   if (locales.includes(userSelectedLocale) === false) {
 *     throw new Error('Locale is not available');
 *   }
 */
export const locales = /** @type {const} */ (["en", "de"]);

/** @type {string} */
export const cookieName = "<cookie-name>";

/** @type {number} */
export const cookieMaxAge = 60 * 60 * 24 * 400;

/** @type {string} */
export const cookieDomain = "<cookie-domain>";

/** @type {string} */
export const localStorageKey = "PARAGLIDE_LOCALE";

/**
 * @type {Array<"cookie" | "baseLocale" | "globalVariable" | "url" | "preferredLanguage" | "localStorage" | `custom-${string}`>}
 */
export const strategy = ["globalVariable"];

/**
 * Route-level strategy overrides.
 *
 * `match` uses URLPattern syntax.
 *
 * @type {Array<{
 *   match: string;
 *   strategy?: Array<"cookie" | "baseLocale" | "globalVariable" | "url" | "preferredLanguage" | "localStorage" | `custom-${string}`>;
 *   exclude?: boolean;
 * }>}
 */
export const routeStrategies = [];

/**
 * The used URL patterns.
 *
 * @type {Array<{ pattern: string, localized: Array<[Locale, string]> }> }
 */
export const urlPatterns = [];

/** @type {string | undefined} */
let cachedRouteStrategyUrl;
/** @type {{ match: string; strategy?: Array<string>; exclude?: boolean } | undefined} */
let cachedRouteStrategy;

/**
 * @param {string | URL} url
 * @returns {{ match: string; strategy?: Array<string>; exclude?: boolean } | undefined}
 */
function findMatchingRouteStrategy(url) {
	if (routeStrategies.length === 0) {
		return undefined;
	}

	const urlString = typeof url === "string" ? url : url.href;
	if (cachedRouteStrategyUrl === urlString) {
		return cachedRouteStrategy;
	}

	const urlObject = new URL(urlString, "http://dummy.com");
	let match;
	for (const routeStrategy of routeStrategies) {
		const pattern = new URLPattern(routeStrategy.match, urlObject.href);
		if (pattern.exec(urlObject.href)) {
			match = routeStrategy;
			break;
		}
	}

	cachedRouteStrategyUrl = urlString;
	cachedRouteStrategy = match;
	return match;
}

/**
 * Returns the strategy to use for a specific URL.
 *
 * If no route strategy matches (or the matching rule is `exclude: true`),
 * the global strategy is returned.
 *
 * @param {string | URL} url
 * @returns {typeof strategy}
 */
export function getStrategyForUrl(url) {
	const routeStrategy = findMatchingRouteStrategy(url);
	if (
		routeStrategy &&
		routeStrategy.exclude !== true &&
		Array.isArray(routeStrategy.strategy)
	) {
		// @ts-ignore - runtime value is injected and validated by compiler types.
		return routeStrategy.strategy;
	}
	return strategy;
}

/**
 * Returns whether the given URL is excluded from middleware i18n processing.
 *
 * @param {string | URL} url
 * @returns {boolean}
 */
export function isExcludedByRouteStrategy(url) {
	return findMatchingRouteStrategy(url)?.exclude === true;
}

/**
 * @typedef {{
 * 		getStore(): {
 *   		locale?: Locale,
 * 			origin?: string,
 * 			messageCalls?: Set<string>
 *   	} | undefined,
 * 		run: (store: { locale?: Locale, origin?: string, messageCalls?: Set<string>},
 *    cb: any) => any
 * }} ParaglideAsyncLocalStorage
 */

/**
 * Server side async local storage that is set by `serverMiddleware()`.
 *
 * The variable is used to retrieve the locale and origin in a server-side
 * rendering context without effecting other requests.
 *
 * @type {ParaglideAsyncLocalStorage | undefined}
 */
export let serverAsyncLocalStorage = undefined;

export const disableAsyncLocalStorage = false;

export const experimentalMiddlewareLocaleSplitting = false;

export const isServer = typeof window === "undefined";

/** @type {Locale | undefined} */
// @ts-ignore - injected by bundlers at compile time
export const experimentalStaticLocale = undefined;

/**
 * Sets the server side async local storage.
 *
 * The function is needed because the `runtime.js` file
 * must define the `serverAsyncLocalStorage` variable to
 * avoid a circular import between `runtime.js` and
 * `server.js` files.
 *
 * @param {ParaglideAsyncLocalStorage | undefined} value
 */
export function overwriteServerAsyncLocalStorage(value) {
	serverAsyncLocalStorage = value;
}

export const TREE_SHAKE_COOKIE_STRATEGY_USED = false;

export const TREE_SHAKE_URL_STRATEGY_USED = false;

export const TREE_SHAKE_GLOBAL_VARIABLE_STRATEGY_USED = false;

export const TREE_SHAKE_PREFERRED_LANGUAGE_STRATEGY_USED = false;

export const TREE_SHAKE_DEFAULT_URL_PATTERN_USED = false;

export const TREE_SHAKE_LOCAL_STORAGE_STRATEGY_USED = false;
