import fs from "node:fs";
import type { CompilerOptions } from "../compiler-options.js";
import { perLocaleBuildStaticLocaleExpression } from "../per-locale-build.js";

/**
 * Returns the code for the `runtime.js` module
 */
export function createRuntimeFile(args: {
	baseLocale: string;
	locales: string[];
	compilerOptions: {
		strategy: NonNullable<CompilerOptions["strategy"]>;
		routeStrategies?: CompilerOptions["routeStrategies"];
		cookieName: NonNullable<CompilerOptions["cookieName"]>;
		cookieMaxAge: NonNullable<CompilerOptions["cookieMaxAge"]>;
		cookieDomain: CompilerOptions["cookieDomain"];
		cookieSameSite?: CompilerOptions["cookieSameSite"];
		cookieSecure?: CompilerOptions["cookieSecure"];
		urlPatterns?: CompilerOptions["urlPatterns"];
		trailingSlash?: CompilerOptions["trailingSlash"];
		isServer: CompilerOptions["isServer"];
		isDevelopment?: CompilerOptions["isDevelopment"];
		experimentalStaticLocale?: CompilerOptions["experimentalStaticLocale"];
		localStorageKey: CompilerOptions["localStorageKey"];
		disableAsyncLocalStorage: NonNullable<
			CompilerOptions["disableAsyncLocalStorage"]
		>;
	};
}): string {
	const urlPatterns = args.compilerOptions.urlPatterns ?? [];
	const routeStrategies = args.compilerOptions.routeStrategies ?? [];

	let defaultUrlPatternUsed = false;

	// add default urlPatterns for a good out of the box experience
	if (args.compilerOptions.urlPatterns === undefined) {
		defaultUrlPatternUsed = true;
		urlPatterns.push({
			pattern: `:protocol://:domain(.*)::port?/:path(.*)?`,
			localized: [],
		});
		for (const locale of args.locales) {
			if (locale === args.baseLocale) {
				continue;
			}
			urlPatterns[0]?.localized.push([
				locale,
				`:protocol://:domain(.*)::port?/${locale}/:path(.*)?`,
			]);
		}
		urlPatterns[0]?.localized.push([
			args.baseLocale,
			`:protocol://:domain(.*)::port?/:path(.*)?`,
		]);
	}
	const strategiesUsedByRoutes = routeStrategies.flatMap((routeStrategy) =>
		"strategy" in routeStrategy ? routeStrategy.strategy : []
	);
	const allUsedStrategies = new Set([
		...args.compilerOptions.strategy,
		...strategiesUsedByRoutes,
	]);
	const needsUrlPatternPolyfill =
		!defaultUrlPatternUsed || routeStrategies.length > 0;

	// verify that urlPatterns' locales are valid
	for (const urlPattern of urlPatterns) {
		for (const [locale] of urlPattern.localized) {
			if (!args.locales.includes(locale)) {
				throw new Error(
					`Invalid locale "${locale}" in urlPatterns. It must be one of the locales defined in the "locales" array.`
				);
			}
		}
	}

	const cookieSecure = args.compilerOptions.cookieSecure ?? false;

	if (
		args.compilerOptions.cookieSameSite === "none" &&
		cookieSecure === false
	) {
		throw new Error(
			`cookieSameSite "none" requires cookieSecure to be true or "auto". Browsers reject SameSite=None cookies without the Secure attribute.`
		);
	}

	const code = `
${needsUrlPatternPolyfill ? `import "@inlang/paraglide-js/urlpattern-polyfill";` : "/** @type {any} */\nconst URLPattern = {}"}

${substitute(injectCode("./variables.js"), [
	[
		`export const baseLocale = "en";`,
		`export const baseLocale = ${JSON.stringify(args.baseLocale)};`,
	],
	[
		`export const locales = /** @type {readonly string[]} */ (["en", "de"]);`,
		`export const locales = /** @type {const} */ (${JSON.stringify(args.locales)});`,
	],
	[
		`export const strategy = ["globalVariable"];`,
		`export const strategy = ${JSON.stringify(args.compilerOptions.strategy, null, 2)};`,
	],
	// String() keeps an explicit `undefined` the string it always was
	[
		`export const cookieName = "<cookie-name>";`,
		`export const cookieName = ${JSON.stringify(String(args.compilerOptions.cookieName))};`,
	],
	[
		`export const cookieMaxAge = 60 * 60 * 24 * 400;`,
		`export const cookieMaxAge = ${args.compilerOptions.cookieMaxAge};`,
	],
	[
		`export const cookieDomain = "<cookie-domain>";`,
		`export const cookieDomain = ${JSON.stringify(String(args.compilerOptions.cookieDomain))};`,
	],
	[
		`/** @type {"lax" | "strict" | "none" | undefined} */ (undefined)`,
		`/** @type {"lax" | "strict" | "none" | undefined} */ (${
			args.compilerOptions.cookieSameSite === undefined
				? "undefined"
				: JSON.stringify(args.compilerOptions.cookieSameSite)
		})`,
	],
	[
		`/** @type {boolean | "auto"} */ (false)`,
		`/** @type {boolean | "auto"} */ (${JSON.stringify(cookieSecure)})`,
	],
	[
		`export const routeStrategies = [];`,
		`export const routeStrategies = ${JSON.stringify(routeStrategies, null, 2)};`,
	],
	[
		`export const TREE_SHAKE_COOKIE_STRATEGY_USED = false;`,
		`const TREE_SHAKE_COOKIE_STRATEGY_USED = ${allUsedStrategies.has("cookie")};`,
	],
	[
		`export const TREE_SHAKE_URL_STRATEGY_USED = false;`,
		`const TREE_SHAKE_URL_STRATEGY_USED = ${allUsedStrategies.has("url")};`,
	],
	[
		`export const TREE_SHAKE_GLOBAL_VARIABLE_STRATEGY_USED = false;`,
		`const TREE_SHAKE_GLOBAL_VARIABLE_STRATEGY_USED = ${allUsedStrategies.has("globalVariable")};`,
	],
	[
		`export const TREE_SHAKE_PREFERRED_LANGUAGE_STRATEGY_USED = false;`,
		`const TREE_SHAKE_PREFERRED_LANGUAGE_STRATEGY_USED = ${allUsedStrategies.has("preferredLanguage")};`,
	],
	[
		`export const urlPatterns = [];`,
		`export const urlPatterns = ${JSON.stringify(urlPatterns, null, 2)};`,
	],
	[
		`export const trailingSlash = undefined;`,
		`export const trailingSlash = ${
			args.compilerOptions.trailingSlash === undefined
				? "undefined"
				: JSON.stringify(args.compilerOptions.trailingSlash)
		};`,
	],
	[
		`export const disableAsyncLocalStorage = false;`,
		`export const disableAsyncLocalStorage = ${args.compilerOptions.disableAsyncLocalStorage};`,
	],
	[
		`export const TREE_SHAKE_DEFAULT_URL_PATTERN_USED = false;`,
		`const TREE_SHAKE_DEFAULT_URL_PATTERN_USED = ${defaultUrlPatternUsed};`,
	],
	[
		`export const isServer = typeof window === "undefined";`,
		`export const isServer = ${args.compilerOptions.isServer};`,
	],
	[
		`export const isDevelopment = /** @type {boolean} */ (true);`,
		`export const isDevelopment = ${args.compilerOptions.isDevelopment ?? "true"};`,
	],
	[
		`export const experimentalStaticLocale = undefined;`,
		args.compilerOptions.experimentalStaticLocale
			? `export const experimentalStaticLocale = ${
					args.compilerOptions.experimentalStaticLocale ===
					perLocaleBuildStaticLocaleExpression
						? args.compilerOptions.experimentalStaticLocale
						: `assertIsLocale(${args.compilerOptions.experimentalStaticLocale})`
				};`
			: `export const experimentalStaticLocale = undefined;`,
	],
	[
		`export const localStorageKey = "PARAGLIDE_LOCALE";`,
		`export const localStorageKey = ${JSON.stringify(String(args.compilerOptions.localStorageKey))};`,
	],
	[
		`export const TREE_SHAKE_LOCAL_STORAGE_STRATEGY_USED = false;`,
		`const TREE_SHAKE_LOCAL_STORAGE_STRATEGY_USED = ${allUsedStrategies.has("localStorage")};`,
	],
])}
// Shared runtime state for backward compatibility and future runtime behavior.
/** @type {any} */ (globalThis).__paraglide =
	/** @type {any} */ (globalThis).__paraglide ?? {};

${injectCode("./get-locale.js")}

${injectCode("./get-text-direction.js")}

${injectCode("./set-locale.js")}

${injectCode("./get-url-origin.js")}

${injectCode("./check-locale.js")}

${injectCode("./normalize-trailing-slash.js", {
	privateExports: ["normalizeTrailingSlash"],
})}

${
	needsUrlPatternPolyfill
		? injectCode("./url-pattern-cache.js", {
				privateExports: ["getUrlPattern"],
			}) +
			"\n\n" +
			injectCode("./url-pattern-index.js", {
				privateExports: [
					"getRoutingConfigVersion",
					"currentRoutingConfigVersion",
					"getUrlPatternCandidates",
					"getRouteStrategyCandidates",
				],
			})
		: `// Default routing does not need a matcher cache or candidate index.
/** @param {string} pattern @param {URL} url @returns {URLPattern} */
function getUrlPattern(pattern, url) { return new URLPattern(pattern, url.href); }
function getRoutingConfigVersion() { return 0; }
function currentRoutingConfigVersion() { return 0; }
/** @param {URL} _url @returns {typeof urlPatterns} */
function getUrlPatternCandidates(_url) { return urlPatterns; }
/** @param {URL} _url @returns {typeof routeStrategies} */
function getRouteStrategyCandidates(_url) { return routeStrategies; }`
}

${injectCode("./exec-url-pattern.js", {
	privateExports: ["execUrlPattern"],
})}

${injectCode("./extract-locale-from-request.js")}

${injectCode("./extract-locale-from-request-async.js")}

${injectCode("./extract-locale-from-cookie.js", {
	privateExports: ["clearLocaleCookieCache"],
})}

${injectCode("./extract-locale-from-header.js")}

${injectCode("./extract-locale-from-navigator.js")}

${injectCode("./extract-locale-from-url.js")}

${injectCode("./localize-url.js")}

${injectCode("./route-strategy.js")}

${injectCode("./should-redirect.js")}

${injectCode("./localize-href.js")}


${injectCode("./generate-static-localized-urls.js")}

${injectCode("./strategy.js")}

${injectCode("./type-definitions.js").replace(
	`@typedef {string} Locale`,
	`@typedef {typeof locales[number]} Locale`
)}
`;

	return code;
}

/**
 * Replaces each search text of the template with its replacement. Every search
 * text is found in the template as given, so a replacement is never searched,
 * and inserted values stay exactly as they are.
 */
function substitute(
	template: string,
	substitutions: ReadonlyArray<[search: string, replacement: string]>
): string {
	const found = substitutions
		.map(([search, replacement]) => {
			const index = template.indexOf(search);
			if (index === -1)
				throw new Error(
					`The runtime template has no ${JSON.stringify(search)}`
				);
			return { index, end: index + search.length, replacement };
		})
		.sort((a, b) => a.index - b.index);
	let result = "";
	let position = 0;
	for (const { index, end, replacement } of found) {
		result += template.slice(position, index) + replacement;
		position = end;
	}
	return result + template.slice(position);
}

/**
 * Load a file from the current directory.
 *
 * Prunes the imports on top of the file as the runtime is
 * self-contained.
 *
 * @param {string} path
 * @param {{ privateExports?: string[] }} [options]
 * @returns {string}
 */
function injectCode(
	path: string,
	options?: { privateExports?: string[] }
): string {
	const code = fs.readFileSync(new URL(path, import.meta.url), "utf-8");
	// Regex to match single-line and multi-line imports
	const importRegex = /^\s*import\s+[\s\S]*?from\s+['"][^'"]+['"]\s*;?/gm;
	const sourceMapRegex = /\/\/# sourceMappingURL=.*$/gm;
	const blockSourceMapRegex = /\/\*# sourceMappingURL=.*?\*\//g;
	let injected = code
		.replace(importRegex, "")
		.replace(sourceMapRegex, "")
		.replace(blockSourceMapRegex, "")
		.trim();
	for (const exportName of options?.privateExports ?? []) {
		injected = injected.replace(
			new RegExp(`\\bexport\\s+function\\s+${exportName}\\b`, "g"),
			`function ${exportName}`
		);
	}
	return injected;
}
