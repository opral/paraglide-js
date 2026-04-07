import { customServerStrategies, isCustomStrategy } from "./strategy.js";
import { getStrategyForUrl } from "./variables.js";
import { toLocale } from "./check-locale.js";
import { extractLocaleFromRequestWithStrategies } from "./extract-locale-from-request.js";

/**
 * Asynchronously extracts a locale from a request.
 *
 * This function supports async custom server strategies, unlike the synchronous
 * `extractLocaleFromRequest`. Use this function when you have custom server strategies
 * that need to perform asynchronous operations (like database calls) in their getLocale method.
 *
 * The function first processes any custom server strategies asynchronously, then falls back
 * to the synchronous `extractLocaleFromRequest` for all other strategies.
 *
 * @see {@link https://github.com/opral/inlang-paraglide-js/issues/527#issuecomment-2978151022}
 *
 * @example
 *   // Basic usage
 *   const locale = await extractLocaleFromRequestAsync(request);
 *
 * @example
 *   // With custom async server strategy
 *   defineCustomServerStrategy("custom-database", {
 *     getLocale: async (request) => {
 *       const userId = extractUserIdFromRequest(request);
 *       return await getUserLocaleFromDatabase(userId);
 *     }
 *   });
 *
 *   const locale = await extractLocaleFromRequestAsync(request);
 *
 * @param {Request} request - The request object to extract the locale from.
 * @param {{ publicUrl?: string | URL }} [options] - Effective public URL to use for route matching and locale detection with the URL strategy.
 * @returns {Promise<Locale>} The extracted locale.
 */
export const extractLocaleFromRequestAsync = async (request, options = {}) => {
	/** @type {string|undefined} */
	let locale;
	const publicUrl = resolvePublicUrlAsync(request, options.publicUrl);
	const strategy = getStrategyForUrl(publicUrl);

	// Process custom strategies first, in order
	for (const strat of strategy) {
		if (isCustomStrategy(strat) && customServerStrategies.has(strat)) {
			const handler = customServerStrategies.get(strat);
			if (handler) {
				/** @type {string|undefined} */
				locale = await handler.getLocale(request);
			}

			// If we got a valid locale from this custom strategy, use it
			const matchedLocale = toLocale(locale);
			if (matchedLocale) {
				return matchedLocale;
			}
		}
	}

	// If no custom strategy provided a valid locale, fall back to sync version
	return extractLocaleFromRequestWithStrategies(request, strategy, publicUrl);
};

/**
 * @param {Request} request
 * @param {string | URL | undefined} publicUrl
 * @returns {URL}
 */
function resolvePublicUrlAsync(request, publicUrl = request.url) {
	if (publicUrl instanceof URL) {
		return new URL(publicUrl.href);
	}

	return new URL(publicUrl, request.url);
}
