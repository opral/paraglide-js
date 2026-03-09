import { localizeUrl } from "./localize-url.js";
import {
	locales,
	baseLocale,
	TREE_SHAKE_DEFAULT_URL_PATTERN_USED,
	urlPatterns,
} from "./variables.js";

/**
 * Generates localized URL variants for all provided URLs based on your configured locales and URL patterns.
 *
 * This function is essential for Static Site Generation (SSG) where you need to tell your framework
 * which pages to pre-render at build time. It's also useful for generating sitemaps and
 * `<link rel="alternate" hreflang>` tags for SEO.
 *
 * The function respects your `urlPatterns` configuration - if you have translated pathnames
 * (e.g., `/about` → `/ueber-uns` for German), it will generate the correct localized paths.
 *
 * @see https://inlang.com/m/gerre34r/library-inlang-paraglideJs/static-site-generation
 *
 * @example
 * // Basic usage - generate all locale variants for a list of paths
 * const localizedUrls = generateStaticLocalizedUrls([
 *   "/",
 *   "/about",
 *   "/blog/post-1",
 * ]);
 * // Returns URL objects for each locale:
 * // ["/en/", "/de/", "/en/about", "/de/about", "/en/blog/post-1", "/de/blog/post-1"]
 *
 * @example
 * // Use with framework SSG APIs
 * // SvelteKit
 * export function entries() {
 *   const paths = ["/", "/about", "/contact"];
 *   return generateStaticLocalizedUrls(paths).map(url => ({
 *     locale: extractLocaleFromUrl(url)
 *   }));
 * }
 *
 * @example
 * // Sitemap generation
 * const allPages = ["/", "/about", "/blog"];
 * const sitemapUrls = generateStaticLocalizedUrls(allPages);
 *
 * @param {(string | URL)[]} urls - List of canonical URLs or paths to generate localized versions for.
 *   Can be absolute URLs (`https://example.com/about`) or paths (`/about`).
 *   Paths are resolved against `http://localhost` internally.
 * @returns {URL[]} Array of URL objects representing all localized variants.
 *   The order follows each input URL with all its locale variants before moving to the next URL.
 */
export function generateStaticLocalizedUrls(urls) {
	/** @type {Set<URL>} */
	const localizedUrls = new Set();

	// For default URL pattern, we can optimize the generation
	if (TREE_SHAKE_DEFAULT_URL_PATTERN_USED) {
		for (const urlInput of urls) {
			const url =
				urlInput instanceof URL
					? urlInput
					: new URL(urlInput, "http://localhost");

			// Base locale doesn't get a prefix
			localizedUrls.add(url);

			// Other locales get their code as prefix
			for (const locale of locales) {
				if (locale !== baseLocale) {
					const localizedPath = `/${locale}${url.pathname}${url.search}${url.hash}`;
					const localizedUrl = new URL(localizedPath, url.origin);
					localizedUrls.add(localizedUrl);
				}
			}
		}
		return Array.from(localizedUrls);
	}

	// For custom URL patterns, we need to use localizeUrl for each URL and locale
	for (const urlInput of urls) {
		const url =
			urlInput instanceof URL
				? urlInput
				: new URL(urlInput, "http://localhost");

		// Try each URL pattern to find one that matches
		let patternFound = false;
		for (const pattern of urlPatterns) {
			try {
				// Try to match the unlocalized pattern
				const unlocalizedMatch = new URLPattern(pattern.pattern, url.href).exec(
					url.href
				);

				if (!unlocalizedMatch) continue;

				patternFound = true;

				// Track unique localized URLs to avoid duplicates when patterns are the same
				const seenUrls = new Set();

				// Generate localized URL for each locale
				for (const [locale] of pattern.localized) {
					try {
						const localizedUrl = localizeUrl(url, { locale });
						const urlString = localizedUrl.href;

						// Only add if we haven't seen this exact URL before
						if (!seenUrls.has(urlString)) {
							seenUrls.add(urlString);
							localizedUrls.add(localizedUrl);
						}
					} catch {
						// Skip if localization fails for this locale
						continue;
					}
				}
				break;
			} catch {
				// Skip if pattern matching fails
				continue;
			}
		}

		// If no pattern matched, use the URL as is
		if (!patternFound) {
			localizedUrls.add(url);
		}
	}

	return Array.from(localizedUrls);
}
