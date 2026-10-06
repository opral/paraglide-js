/** @type {Map<string, URLPattern>} */
const urlPatternCache = new Map();

const URL_PATTERN_CACHE_LIMIT = 1024;
const ABSOLUTE_URL_PATTERN =
	/^(?:[A-Za-z][A-Za-z\d+.-]*|:[A-Za-z][A-Za-z\d_-]*):\/\//;

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
export function getUrlPattern(pattern, url) {
	const isAbsolutePattern = ABSOLUTE_URL_PATTERN.test(pattern);
	// Opaque/file origins are not a unique base key (different file hosts all
	// have origin "null"). Keep their constructor semantics uncached.
	const isRootRelativePattern =
		pattern.startsWith("/") && /^https?:$/.test(url.protocol);
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
