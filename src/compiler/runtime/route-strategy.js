import { deLocalizeUrl } from "./localize-url.js";
import { normalizeTrailingSlash } from "./normalize-trailing-slash.js";
import { execUrlPattern } from "./exec-url-pattern.js";
import { routeStrategies, strategy } from "./variables.js";

/** @type {string | undefined} */
let cachedRouteStrategyUrl;
/** @type {{ match: string; strategy?: typeof strategy; exclude?: boolean } | undefined} */
let cachedRouteStrategy;

/**
 * Match route policy against both the public URL and its canonical URL.
 *
 * The function is deliberately separate from variables.js: configuration is
 * inert data, while canonicalization and route selection form a routing layer.
 *
 * @param {string | URL} url
 * @returns {{ match: string; strategy?: typeof strategy; exclude?: boolean } | undefined}
 */
export function findMatchingRouteStrategy(url) {
	if (routeStrategies.length === 0) {
		return undefined;
	}

	const urlString = typeof url === "string" ? url : url.href;
	if (cachedRouteStrategyUrl === urlString) {
		return cachedRouteStrategy;
	}

	const publicUrl = normalizeTrailingSlash(
		new URL(urlString, "http://example.com")
	);
	const canonicalUrl = deLocalizeUrl(publicUrl);
	const candidateUrls =
		canonicalUrl.href === publicUrl.href
			? [publicUrl]
			: [publicUrl, canonicalUrl];
	let match;
	for (const candidateUrl of candidateUrls) {
		for (const routeStrategy of routeStrategies) {
			const pattern = new URLPattern(routeStrategy.match, candidateUrl.href);
			if (execUrlPattern(pattern, candidateUrl)) {
				match = routeStrategy;
				break;
			}
		}
		if (match) break;
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
