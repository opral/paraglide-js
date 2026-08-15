import { trailingSlash } from "./variables.js";

/**
 * Applies the configured trailing slash policy to a URL.
 *
 * The root pathname always remains `/`. Query parameters and hashes are not
 * modified.
 *
 * @param {URL} url
 * @returns {URL}
 */
export function normalizeTrailingSlash(url) {
	if (trailingSlash === undefined || url.pathname === "/") {
		return url;
	}

	if (trailingSlash === "never") {
		url.pathname = url.pathname.replace(/\/+$/, "") || "/";
	} else if (trailingSlash === "always") {
		url.pathname = url.pathname.replace(/\/+$/, "") + "/";
	}

	return url;
}
