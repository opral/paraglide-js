import { localizeUrl } from "./localize-url.js";
import { toLocale } from "./check-locale.js";
import { getLocale, getLocaleForUrl } from "./get-locale.js";
import { getUrlOrigin } from "./get-url-origin.js";
import { extractLocaleFromRequestAsync } from "./extract-locale-from-request-async.js";
import { getStrategyForUrl, isExcludedByRouteStrategy } from "./variables.js";

/**
 * @typedef {object} ShouldRedirectServerInput
 * @property {Request} request
 * @property {string | URL} [effectiveRequestUrl] - Effective request URL to use for route matching, locale detection with the URL strategy, and redirect targets.
 * @property {Locale} [locale]
 *
 * @typedef {object} ShouldRedirectClientInput
 * @property {undefined} [request]
 * @property {string | URL} [url]
 * @property {Locale} [locale]
 *
 * @typedef {ShouldRedirectServerInput | ShouldRedirectClientInput} ShouldRedirectInput
 *
 * @typedef {object} ShouldRedirectResult
 * @property {boolean} shouldRedirect - Indicates whether the consumer should perform a redirect.
 * @property {Locale} locale - Locale resolved using the configured strategies.
 * @property {URL | undefined} redirectUrl - Destination URL when a redirect is required.
 */

/**
 * Determines whether a redirect is required to align the current URL with the active locale.
 *
 * This helper mirrors the logic that powers `paraglideMiddleware`, but works in both server
 * and client environments. It evaluates the configured strategies in order, computes the
 * canonical localized URL, and reports when the current URL does not match.
 *
 * When called in the browser without arguments, the current `window.location.href` is used.
 *
 * @see https://inlang.com/m/gerre34r/library-inlang-paraglideJs/i18n-routing#client-side-redirects
 *
 * @example
 * // Client side usage (e.g. TanStack Router beforeLoad hook)
 * async function beforeLoad({ location }) {
 *   const decision = await shouldRedirect({ url: location.href });
 *
 *   if (decision.shouldRedirect) {
 *     throw redirect({ to: decision.redirectUrl.href });
 *   }
 * }
 *
 * @example
 * // Server side usage with a Request
 * export async function handle(request) {
 *   const decision = await shouldRedirect({ request });
 *
 *   if (decision.shouldRedirect) {
 *     return Response.redirect(decision.redirectUrl, 307);
 *   }
 *
 *   return render(request, decision.locale);
 * }
 *
 * @example
 * // Server side usage behind a proxy where request.url is not public-facing
 * export async function handle(request) {
 *   const effectiveRequestUrl = new URL(request.url);
 *   effectiveRequestUrl.protocol = "https:";
 *   effectiveRequestUrl.host = "example.com";
 *
 *   const decision = await shouldRedirect({
 *     request,
 *     effectiveRequestUrl,
 *   });
 *
 *   if (decision.shouldRedirect) {
 *     return Response.redirect(decision.redirectUrl, 307);
 *   }
 * }
 *
 * @param {ShouldRedirectInput} [input]
 * @returns {Promise<ShouldRedirectResult>}
 */
export async function shouldRedirect(input = {}) {
	const currentUrl = resolveUrl(input);
	const locale = await resolveLocale(input, currentUrl);
	const strategy = getStrategyForUrl(currentUrl.href);

	if (isExcludedByRouteStrategy(currentUrl.href) || !strategy.includes("url")) {
		return { shouldRedirect: false, locale, redirectUrl: undefined };
	}

	const localizedUrl = localizeUrl(currentUrl.href, { locale });

	const shouldRedirectToLocalizedUrl =
		normalizeUrl(localizedUrl.href) !== normalizeUrl(currentUrl.href);

	return {
		shouldRedirect: shouldRedirectToLocalizedUrl,
		locale,
		redirectUrl: shouldRedirectToLocalizedUrl ? localizedUrl : undefined,
	};
}

/**
 * Resolves the locale either from the provided input or by using the configured strategies.
 *
 * @param {ShouldRedirectInput} input
 * @param {URL} currentUrl
 * @returns {Promise<Locale>}
 */
async function resolveLocale(input, currentUrl) {
	const locale = toLocale(input.locale);
	if (locale) {
		return locale;
	}

	if (input.request) {
		return extractLocaleFromRequestAsync(input.request, {
			effectiveRequestUrl: currentUrl,
		});
	}

	if ("url" in input && typeof input.url !== "undefined") {
		return getLocaleForUrl(currentUrl.href);
	}

	return getLocale();
}

/**
 * Resolves the current URL from the provided input or runtime context.
 *
 * @param {ShouldRedirectInput} input
 * @returns {URL}
 */
function resolveUrl(input) {
	if ("effectiveRequestUrl" in input && input.effectiveRequestUrl instanceof URL) {
		return new URL(input.effectiveRequestUrl.href);
	}

	if ("effectiveRequestUrl" in input && typeof input.effectiveRequestUrl === "string") {
		return new URL(
			input.effectiveRequestUrl,
			input.request ? input.request.url : getUrlOrigin()
		);
	}

	if (input.request) {
		return new URL(input.request.url);
	}

	if ("url" in input && input.url instanceof URL) {
		return new URL(input.url.href);
	}

	if ("url" in input && typeof input.url === "string") {
		return new URL(input.url, getUrlOrigin());
	}

	if (typeof window !== "undefined" && window?.location?.href) {
		return new URL(window.location.href);
	}

	throw new Error(
		"shouldRedirect() requires either a request, an absolute URL, or must run in a browser environment."
	);
}

/**
 * Normalize url for comparison by stripping the trailing slash.
 *
 * @param {string} url
 * @returns {string}
 */
function normalizeUrl(url) {
	const urlObj = new URL(url);
	urlObj.pathname = urlObj.pathname.replace(/\/$/, "");
	return urlObj.href;
}
