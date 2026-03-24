import { assertIsLocale, toLocale } from "./check-locale.js";
import { extractLocaleFromCookie } from "./extract-locale-from-cookie.js";
import { extractLocaleFromNavigator } from "./extract-locale-from-navigator.js";
import { extractLocaleFromUrl } from "./extract-locale-from-url.js";
import { setLocale } from "./set-locale.js";
import { customClientStrategies, isCustomStrategy } from "./strategy.js";
import {
	baseLocale,
	getStrategyForUrl,
	isServer,
	localStorageKey,
	serverAsyncLocalStorage,
	experimentalStaticLocale,
	strategy,
	TREE_SHAKE_COOKIE_STRATEGY_USED,
	TREE_SHAKE_GLOBAL_VARIABLE_STRATEGY_USED,
	TREE_SHAKE_LOCAL_STORAGE_STRATEGY_USED,
	TREE_SHAKE_PREFERRED_LANGUAGE_STRATEGY_USED,
	TREE_SHAKE_URL_STRATEGY_USED,
} from "./variables.js";

/**
 * Locale storage using globalThis to share state across module instances.
 *
 * Bundlers like Turbopack (and sometimes Webpack) create separate module
 * instances for server and client bundles during SSR. A module-level
 * `let _locale` doesn't cross this boundary, causing `getLocale()` to
 * return the wrong locale in client components during SSR.
 *
 * `globalThis` is shared across all module instances in the same process,
 * fixing the cross-module-boundary issue.
 *
 * See: https://github.com/opral/paraglide-js/issues/524
 * See: https://github.com/vercel/next.js/discussions/76582
 *
 * @type {string}
 */
const _PARAGLIDE_LOCALE_KEY = "__paraglide_locale";

/** @returns {Locale | undefined} */
export const _getLocaleFromGlobal = () => globalThis[_PARAGLIDE_LOCALE_KEY];

/** @param {Locale} v */
export const _setLocaleOnGlobal = (v) => {
	globalThis[_PARAGLIDE_LOCALE_KEY] = v;
};

let localeInitiallySet = false;

/**
 * Get the current locale.
 *
 * The locale is resolved using your configured strategies (URL, cookie, localStorage, etc.)
 * in the order they are defined. In SSR contexts, the locale is retrieved from AsyncLocalStorage
 * which is set by the `paraglideMiddleware()`.
 *
 * @see https://inlang.com/m/gerre34r/library-inlang-paraglideJs/strategy - Configure locale detection strategies
 *
 * @example
 *   if (getLocale() === 'de') {
 *     console.log('Germany 🇩🇪');
 *   } else if (getLocale() === 'nl') {
 *     console.log('Netherlands 🇳🇱');
 *   }
 *
 * @returns {Locale} The current locale.
 */
export let getLocale = () => {
	if (experimentalStaticLocale !== undefined) {
		return experimentalStaticLocale;
	}

	// if running in a server-side rendering context
	// retrieve the locale from the async local storage
	if (serverAsyncLocalStorage) {
		const locale = serverAsyncLocalStorage?.getStore()?.locale;
		if (locale) {
			return locale;
		}
	}

	let strategyToUse = strategy;
	if (!isServer && typeof window !== "undefined" && window.location?.href) {
		strategyToUse = getStrategyForUrl(window.location.href);
	}

	const resolved = resolveLocaleWithStrategies(
		strategyToUse,
		typeof window !== "undefined" ? window.location?.href : undefined
	);
	if (resolved) {
		if (!localeInitiallySet) {
			_setLocaleOnGlobal(resolved);
			// https://github.com/opral/inlang-paraglide-js/issues/455
			localeInitiallySet = true;
			setLocale(resolved, { reload: false });
		}
		return resolved;
	}

	throw new Error(
		"No locale found. Read the docs https://inlang.com/m/gerre34r/library-inlang-paraglideJs/errors#no-locale-found"
	);
};

/**
 * Resolve locale for a given URL using route-aware strategies.
 *
 * @param {string | URL} url
 * @returns {Locale}
 */
export function getLocaleForUrl(url) {
	if (experimentalStaticLocale !== undefined) {
		return experimentalStaticLocale;
	}

	const strategyToUse = getStrategyForUrl(url);
	const resolved = resolveLocaleWithStrategies(
		strategyToUse,
		typeof url === "string" ? url : url.href
	);
	if (resolved) {
		return resolved;
	}

	throw new Error(
		"No locale found. Read the docs https://inlang.com/m/gerre34r/library-inlang-paraglideJs/errors#no-locale-found"
	);
}

/**
 * @param {typeof strategy} strategyToUse
 * @param {string | undefined} urlForUrlStrategy
 * @returns {Locale | undefined}
 */
function resolveLocaleWithStrategies(strategyToUse, urlForUrlStrategy) {
	/** @type {string | undefined} */
	let locale;

	for (const strat of strategyToUse) {
		if (TREE_SHAKE_COOKIE_STRATEGY_USED && strat === "cookie") {
			locale = extractLocaleFromCookie();
		} else if (strat === "baseLocale") {
			locale = baseLocale;
		} else if (
			TREE_SHAKE_URL_STRATEGY_USED &&
			strat === "url" &&
			!isServer &&
			typeof urlForUrlStrategy === "string"
		) {
			locale = extractLocaleFromUrl(urlForUrlStrategy);
		} else if (
			TREE_SHAKE_GLOBAL_VARIABLE_STRATEGY_USED &&
			strat === "globalVariable" &&
			_getLocaleFromGlobal() !== undefined
		) {
			locale = _getLocaleFromGlobal();
		} else if (
			TREE_SHAKE_PREFERRED_LANGUAGE_STRATEGY_USED &&
			strat === "preferredLanguage" &&
			!isServer
		) {
			locale = extractLocaleFromNavigator();
		} else if (
			TREE_SHAKE_LOCAL_STORAGE_STRATEGY_USED &&
			strat === "localStorage" &&
			!isServer
		) {
			locale = localStorage.getItem(localStorageKey) ?? undefined;
		} else if (isCustomStrategy(strat) && customClientStrategies.has(strat)) {
			const handler = customClientStrategies.get(strat);
			if (handler) {
				const result = handler.getLocale();
				// Handle both sync and async results - skip async in sync getLocale
				if (result instanceof Promise) {
					// Can't await in sync function, skip async strategies
					continue;
				}
				if (result !== undefined) {
					return assertIsLocale(result);
				}
			}
		}

		const matchedLocale = toLocale(locale);
		if (matchedLocale) {
			return matchedLocale;
		}
	}

	return undefined;
}

/**
 * Overwrite the `getLocale()` function.
 *
 * Use this function to overwrite how the locale is resolved. This is useful
 * for custom locale resolution or advanced use cases like SSG with concurrent rendering.
 *
 * @see https://inlang.com/m/gerre34r/library-inlang-paraglideJs/strategy
 *
 * @example
 *   overwriteGetLocale(() => {
 *     return Cookies.get('locale') ?? baseLocale
 *   });
 *
 * @param {() => Locale} fn - The new implementation for `getLocale()`.
 */
export const overwriteGetLocale = (fn) => {
	getLocale = fn;
};
