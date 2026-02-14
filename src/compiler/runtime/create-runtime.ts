import fs from "node:fs";
import type { CompilerOptions } from "../compiler-options.js";

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
		urlPatterns?: CompilerOptions["urlPatterns"];
		experimentalMiddlewareLocaleSplitting: CompilerOptions["experimentalMiddlewareLocaleSplitting"];
		isServer: CompilerOptions["isServer"];
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

	const code = `
${needsUrlPatternPolyfill ? `import "@inlang/paraglide-js/urlpattern-polyfill";` : "/** @type {any} */\nconst URLPattern = {}"}

${injectCode("./variables.js")
	.replace(
		`export const baseLocale = "en";`,
		`export const baseLocale = "${args.baseLocale}";`
	)
	.replace(
		`export const locales = /** @type {const} */ (["en", "de"]);`,
		`export const locales = /** @type {const} */ (["${args.locales.join('", "')}"]);`
	)
	.replace(
		`export const strategy = ["globalVariable"];`,
		`export const strategy = ${JSON.stringify(args.compilerOptions.strategy, null, 2)};`
	)
	.replace(`<cookie-name>`, `${args.compilerOptions.cookieName}`)
	.replace(`60 * 60 * 24 * 400`, `${args.compilerOptions.cookieMaxAge}`)
	.replace(`<cookie-domain>`, `${args.compilerOptions.cookieDomain}`)
	.replace(
		`export const routeStrategies = [];`,
		`export const routeStrategies = ${JSON.stringify(routeStrategies, null, 2)};`
	)
	.replace(
		`export const TREE_SHAKE_COOKIE_STRATEGY_USED = false;`,
		`const TREE_SHAKE_COOKIE_STRATEGY_USED = ${allUsedStrategies.has("cookie")};`
	)
	.replace(
		`export const TREE_SHAKE_URL_STRATEGY_USED = false;`,
		`const TREE_SHAKE_URL_STRATEGY_USED = ${allUsedStrategies.has("url")};`
	)
	.replace(
		`export const TREE_SHAKE_GLOBAL_VARIABLE_STRATEGY_USED = false;`,
		`const TREE_SHAKE_GLOBAL_VARIABLE_STRATEGY_USED = ${allUsedStrategies.has("globalVariable")};`
	)
	.replace(
		`export const TREE_SHAKE_PREFERRED_LANGUAGE_STRATEGY_USED = false;`,
		`const TREE_SHAKE_PREFERRED_LANGUAGE_STRATEGY_USED = ${allUsedStrategies.has("preferredLanguage")};`
	)
	.replace(
		`export const urlPatterns = [];`,
		`export const urlPatterns = ${JSON.stringify(urlPatterns, null, 2)};`
	)
	.replace(
		`export const disableAsyncLocalStorage = false;`,
		`export const disableAsyncLocalStorage = ${args.compilerOptions.disableAsyncLocalStorage};`
	)
	.replace(
		`export const TREE_SHAKE_DEFAULT_URL_PATTERN_USED = false;`,
		`const TREE_SHAKE_DEFAULT_URL_PATTERN_USED = ${defaultUrlPatternUsed};`
	)
	.replace(
		`export const experimentalMiddlewareLocaleSplitting = false;`,
		`export const experimentalMiddlewareLocaleSplitting = ${args.compilerOptions.experimentalMiddlewareLocaleSplitting};`
	)
	.replace(
		`export const isServer = typeof window === "undefined";`,
		`export const isServer = ${args.compilerOptions.isServer};`
	)
	.replace(
		`export const experimentalStaticLocale = undefined;`,
		`export const experimentalStaticLocale = ${args.compilerOptions.experimentalStaticLocale ?? "undefined"};`
	)
	.replace(
		`export const localStorageKey = "PARAGLIDE_LOCALE";`,
		`export const localStorageKey = "${args.compilerOptions.localStorageKey}";`
	)
	.replace(
		`export const TREE_SHAKE_LOCAL_STORAGE_STRATEGY_USED = false;`,
		`const TREE_SHAKE_LOCAL_STORAGE_STRATEGY_USED = ${allUsedStrategies.has("localStorage")};`
	)}

globalThis.__paraglide = {}

${injectCode("./get-locale.js")}

${injectCode("./set-locale.js")}

${injectCode("./get-url-origin.js")}

${injectCode("./is-locale.js")}

${injectCode("./assert-is-locale.js")}

${injectCode("./extract-locale-from-request.js")}

${injectCode("./extract-locale-from-request-async.js")}

${injectCode("./extract-locale-from-cookie.js")}

${injectCode("./extract-locale-from-header.js")}

${injectCode("./extract-locale-from-navigator.js")}

${injectCode("./extract-locale-from-url.js")}

${injectCode("./localize-url.js")}

${injectCode("./should-redirect.js")}

${injectCode("./localize-href.js")}

${injectCode("./track-message-call.js")}

${injectCode("./generate-static-localized-urls.js")}

${injectCode("./strategy.js")}

// ------ TYPES ------

/**
 * A locale that is available in the project.
 *
 * @example
 *   setLocale(request.locale as Locale)
 *
 * @typedef {(typeof locales)[number]} Locale
 */

/**
 * A branded type representing a localized string.
 *
 * Message functions return this type instead of \`string\`, enabling TypeScript
 * to distinguish translated strings from regular strings at compile time.
 * This allows you to enforce that only properly localized content is used
 * in your UI components.
 *
 * Since \`LocalizedString\` is a branded subtype of \`string\`, it remains fully
 * backward compatible—you can pass it anywhere a \`string\` is expected.
 *
 * @example
 *   // Enforce localized strings in your components
 *   function PageTitle(props: { title: LocalizedString }) {
 *     return <h1>{props.title}</h1>
 *   }
 *
 *   // ✅ Correct: using a message function
 *   <PageTitle title={m.welcome_title()} />
 *
 *   // ❌ Type error: raw strings are not LocalizedString
 *   <PageTitle title="Welcome" />
 *
 * @example
 *   // LocalizedString is assignable to string (backward compatible)
 *   const localized: LocalizedString = m.greeting()
 *   const str: string = localized  // ✅ works fine
 *
 *   // But string is not assignable to LocalizedString
 *   const raw: LocalizedString = "Hello"  // ❌ Type error
 *
 * @example
 *   // Catches accidental string concatenation
 *   function showMessage(msg: LocalizedString) { ... }
 *
 *   showMessage(m.hello())                    // ✅
 *   showMessage("Hello " + userName)          // ❌ Type error
 *   showMessage(m.hello_user({ name: userName }))  // ✅ use params instead
 *
 * @typedef {string & { readonly __brand: 'LocalizedString' }} LocalizedString
 */

/**
 * Record of markup options for a tag instance.
 *
 * @typedef {Record<string, unknown>} MessageMarkupOptions
 */

/**
 * Record of markup attributes for a tag instance.
 *
 * @typedef {Record<string, string | true>} MessageMarkupAttributes
 */

/**
 * Type-level schema for a single markup tag.
 *
 * @typedef {{
 *   options: MessageMarkupOptions;
 *   attributes: MessageMarkupAttributes;
 *   children: boolean;
 * }} MessageMarkupTag
 */

/**
 * Type-level schema for all markup tags in a message.
 *
 * @typedef {Record<string, MessageMarkupTag>} MessageMarkupSchema
 */

/**
 * Type-only metadata attached to compiled message functions.
 *
 * @template Inputs
 * @template Options
 * @template {MessageMarkupSchema} Markup
 * @typedef {{
 *   readonly __paraglide?: {
 *     inputs: Inputs;
 *     options: Options;
 *     markup: Markup;
 *   };
 * }} MessageMetadata
 */

/**
 * A compiled, framework-neutral message part.
 *
 * @typedef {{
 *   type: "text";
 *   value: string;
 * } | {
 *   type: "markup-start";
 *   name: string;
 *   options: MessageMarkupOptions;
 *   attributes: MessageMarkupAttributes;
 * } | {
 *   type: "markup-end";
 *   name: string;
 *   options: MessageMarkupOptions;
 *   attributes: MessageMarkupAttributes;
 * } | {
 *   type: "markup-standalone";
 *   name: string;
 *   options: MessageMarkupOptions;
 *   attributes: MessageMarkupAttributes;
 * }} MessagePart
 */

`;

	return code;
}

/**
 * Load a file from the current directory.
 *
 * Prunes the imports on top of the file as the runtime is
 * self-contained.
 *
 * @param {string} path
 * @returns {string}
 */
function injectCode(path: string): string {
	const code = fs.readFileSync(new URL(path, import.meta.url), "utf-8");
	// Regex to match single-line and multi-line imports
	const importRegex = /import\s+[\s\S]*?from\s+['"][^'"]+['"]\s*;?/g;
	const sourceMapRegex = /\/\/# sourceMappingURL=.*$/gm;
	const blockSourceMapRegex = /\/\*# sourceMappingURL=.*?\*\//g;
	return code
		.replace(importRegex, "")
		.replace(sourceMapRegex, "")
		.replace(blockSourceMapRegex, "")
		.trim();
}
