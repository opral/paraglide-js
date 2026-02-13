import { assertIsLocale } from "./assert-is-locale.js";
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
 * This is a fallback to get started with a custom
 * strategy and avoid type errors.
 *
 * The implementation is overwritten
 * by \`overwriteGetLocale()\` and \`defineSetLocale()\`.
 *
 * @type {Locale|undefined}
 */
let _locale;

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
 * @type {() => Locale}
 */
export let getLocale = () => {
	if (experimentalStaticLocale !== undefined) {
		return assertIsLocale(experimentalStaticLocale);
	}

	/** @type {string | undefined} */
	let locale;

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

	for (const strat of strategyToUse) {
		if (TREE_SHAKE_COOKIE_STRATEGY_USED && strat === "cookie") {
			locale = extractLocaleFromCookie();
		} else if (strat === "baseLocale") {
			locale = baseLocale;
		} else if (
			TREE_SHAKE_URL_STRATEGY_USED &&
			strat === "url" &&
			!isServer &&
			typeof window !== "undefined"
		) {
			locale = extractLocaleFromUrl(window.location.href);
		} else if (
			TREE_SHAKE_GLOBAL_VARIABLE_STRATEGY_USED &&
			strat === "globalVariable" &&
			_locale !== undefined
		) {
			locale = _locale;
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
				locale = result;
			}
		}
		// check if match, else continue loop
		if (locale !== undefined) {
			const asserted = assertIsLocale(locale);
			if (!localeInitiallySet) {
				_locale = asserted;
				// https://github.com/opral/inlang-paraglide-js/issues/455
				localeInitiallySet = true;
				setLocale(asserted, { reload: false });
			}
			return asserted;
		}
	}

	throw new Error(
		"No locale found. Read the docs https://inlang.com/m/gerre34r/library-inlang-paraglideJs/errors#no-locale-found"
	);
};

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
 * @type {(fn: () => Locale) => void}
 */
export const overwriteGetLocale = (fn) => {
	getLocale = fn;
};
