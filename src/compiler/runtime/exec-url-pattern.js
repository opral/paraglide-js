import { trailingSlash } from "./variables.js";

/**
 * Matches a canonical URL while allowing configured patterns to retain their
 * existing trailing slash style.
 *
 * @param {URLPattern} pattern
 * @param {URL} url
 * @returns {any}
 */
export function execUrlPattern(pattern, url) {
	if (trailingSlash === undefined || url.pathname === "/") {
		return pattern.exec(url.href);
	}

	const alias = new URL(url);
	if (trailingSlash === "always") {
		alias.pathname = alias.pathname.replace(/\/+$/, "") || "/";
		// Prefer the slashless alias so the canonical slash does not become part
		// of a terminal wildcard capture.
		return pattern.exec(alias.href) ?? pattern.exec(url.href);
	} else if (trailingSlash === "never") {
		const match = pattern.exec(url.href);
		if (match) {
			return match;
		}
		alias.pathname = alias.pathname.replace(/\/+$/, "") + "/";
		return pattern.exec(alias.href);
	}
	return pattern.exec(url.href);
}
