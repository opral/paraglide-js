import { urlPatterns, routeStrategies } from "./variables.js";

/** @typedef {{ children: Map<string, PrefixNode>, ranks: Set<number> }} PrefixNode */
/** @typedef {{ items: any[], snapshots: any[], root: PrefixNode }} PatternIndex */

/** @type {PatternIndex | undefined} */
let urlPatternIndex;
/** @type {PatternIndex | undefined} */
let routeStrategyIndex;
let routingConfigVersion = 0;

/**
 * Validate the public mutable configuration before reusing derived routing data.
 * String/reference comparisons intentionally remain O(n): they preserve edits
 * through retained array/object references without changing the public objects.
 * Native matching of unrelated routes is the expensive work this index avoids.
 * @returns {number}
 */
export function getRoutingConfigVersion() {
	if (!indexIsCurrent(urlPatternIndex, urlPatterns, false)) {
		urlPatternIndex = buildPatternIndex(urlPatterns, false);
		routingConfigVersion++;
	}
	if (!indexIsCurrent(routeStrategyIndex, routeStrategies, true)) {
		routeStrategyIndex = buildPatternIndex(routeStrategies, true);
		routingConfigVersion++;
	}
	return routingConfigVersion;
}

/** @returns {number} */
export function currentRoutingConfigVersion() {
	return routingConfigVersion;
}

/** @param {URL} url @returns {typeof urlPatterns} */
export function getUrlPatternCandidates(url) {
	getRoutingConfigVersion();
	return patternCandidates(urlPatternIndex, url, urlPatterns);
}

/** @param {URL} url @returns {typeof routeStrategies} */
export function getRouteStrategyCandidates(url) {
	getRoutingConfigVersion();
	return patternCandidates(routeStrategyIndex, url, routeStrategies);
}

/**
 * Only a complete, conservative root-relative grammar is eligible. Unknown
 * syntax stays unconditional, including invalid patterns whose constructor
 * errors must remain observable. Stop indexing at the first dynamic segment.
 * @param {string} pattern
 * @returns {string[]}
 */
function mandatoryPathSegments(pattern) {
	if (
		typeof pattern !== "string" ||
		!pattern.startsWith("/") ||
		pattern.startsWith("//")
	)
		return [];
	const segments = pattern.slice(1).split("/");
	const names = new Set();
	const literal = /^[A-Za-z0-9_-]+$/;
	const parameter = /^:([A-Za-z_][A-Za-z0-9_]*)(?:[?*+]|\(\.\*\)\??)?$/;
	for (let i = 0; i < segments.length; i++) {
		const segment = segments[i] ?? "";
		if (segment === "" && i === segments.length - 1) continue;
		if (literal.test(segment)) continue;
		const match = parameter.exec(segment);
		if (!match || names.has(match[1])) return [];
		names.add(match[1]);
	}
	const prefix = [];
	for (const segment of segments) {
		if (!literal.test(segment)) break;
		prefix.push(segment);
	}
	return prefix;
}

/** @param {PatternIndex | undefined} index @param {any[]} items @param {boolean} policies */
function indexIsCurrent(index, items, policies) {
	if (
		!index ||
		index.items !== items ||
		index.snapshots.length !== items.length
	)
		return false;
	for (let i = 0; i < items.length; i++) {
		const item = items[i];
		const saved = index.snapshots[i];
		if (
			item !== saved.item ||
			(policies ? item?.match : item?.pattern) !== saved.pattern
		)
			return false;
		if (policies) continue;
		const localized = item?.localized;
		if (
			!Array.isArray(localized) ||
			saved.localized !== localized ||
			saved.entries.length !== localized.length
		)
			return false;
		for (let j = 0; j < localized.length; j++) {
			const entry = localized[j];
			const previous = saved.entries[j];
			if (
				entry !== previous.entry ||
				entry?.[0] !== previous.locale ||
				entry?.[1] !== previous.pattern
			)
				return false;
		}
	}
	return true;
}

/** @param {any[]} items @param {boolean} policies @returns {PatternIndex} */
function buildPatternIndex(items, policies) {
	/** @type {PrefixNode} */
	const root = { children: new Map(), ranks: new Set() };
	const snapshots = [];
	for (let rank = 0; rank < items.length; rank++) {
		const item = items[rank];
		const pattern = policies ? item?.match : item?.pattern;
		const localized = policies ? undefined : item?.localized;
		const entries = Array.isArray(localized)
			? Array.from(localized, (entry) => ({
					entry,
					locale: entry?.[0],
					pattern: entry?.[1],
				}))
			: [];
		snapshots.push({ item, pattern, localized, entries });
		const paths = [pattern, ...entries.map((entry) => entry.pattern)].map(
			mandatoryPathSegments
		);
		// A malformed element must also remain in the original native scan.
		if (
			(!policies &&
				(!Array.isArray(localized) ||
					entries.some(({ entry }) => !Array.isArray(entry)))) ||
			paths.some((path) => path.length === 0)
		) {
			root.ranks.add(rank);
			continue;
		}
		for (const path of paths) {
			let node = root;
			for (const segment of path) {
				let child = node.children.get(segment);
				if (!child) {
					child = { children: new Map(), ranks: new Set() };
					node.children.set(segment, child);
				}
				node = child;
			}
			node.ranks.add(rank);
		}
	}
	return { items, snapshots, root };
}

/** @param {PatternIndex | undefined} index @param {URL} url @param {any[]} items @returns {any[]} */
function patternCandidates(index, url, items) {
	// Root-relative constructor/base behavior for other schemes is deliberately
	// left to URLPattern, as are configurations with no prunable prefixes.
	if (
		!index ||
		!/^https?:$/.test(url.protocol) ||
		index.root.ranks.size === items.length
	)
		return items;
	const ranks = new Set(index.root.ranks);
	let node = index.root;
	for (const segment of url.pathname.slice(1).split("/")) {
		const child = node.children.get(segment);
		if (!child) break;
		node = child;
		for (const rank of node.ranks) ranks.add(rank);
	}
	// Specificity must never change precedence, including unconditional patterns.
	return [...ranks].sort((a, b) => a - b).map((rank) => items[rank]);
}
