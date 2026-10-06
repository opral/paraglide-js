import { expect, test } from "vitest";
import { URLPattern as PolyfillURLPattern } from "urlpattern-polyfill";
import { createRuntimeFile } from "./create-runtime.js";
import { defaultCompilerOptions } from "../compiler-options.js";

const engines = [PolyfillURLPattern as unknown as typeof URLPattern];
const nativeURLPattern = Reflect.get(globalThis, "URLPattern") as
	| typeof URLPattern
	| undefined;
if (nativeURLPattern && nativeURLPattern !== PolyfillURLPattern) {
	engines.push(nativeURLPattern);
}
let moduleId = 0;

const patterns = [
	"/section/:slug",
	"/section/:slug?",
	"/section/:slug*",
	"/section/:slug+",
	"/section/:slug(.*)?",
	"/section/:slug(.*)",
	"/section/literal",
	"/section/:slug/details",
	"/section/:a/:b?",
	"/section/:slug(\\d+)",
	"/section/{literal}?",
	"/section%2Fliteral/:slug",
	"/section//:slug",
	"/section/../other/:slug",
	"https://example.com/section/:slug",
	"section/:slug",
	"/section/:slug/:slug",
	"/section/:slug([)",
];
const paths = [
	"/",
	"/section",
	"/section/",
	"/section/literal",
	"/section/story",
	"/section/123",
	"/section/story/details",
	"/section/story/other",
	"/section//story",
	"/section%2Fliteral/story",
	"/other/story",
	"/unknown",
];

function outcome(fn: () => unknown) {
	try {
		const result = fn();
		return {
			value:
				result instanceof URL
					? result.href
					: Array.isArray(result)
						? result.map((url) => url.href)
						: result,
		};
	} catch (error) {
		return {
			error:
				error instanceof Error ? [error.name, error.message] : String(error),
		};
	}
}

for (const ctor of engines) {
	test(`${ctor === PolyfillURLPattern ? "polyfill" : "native"} candidate index agrees with native ordered scans`, async () => {
		const previous = Reflect.get(globalThis, "URLPattern");
		Object.defineProperty(globalThis, "URLPattern", {
			configurable: true,
			writable: true,
			value: ctor,
		});
		let comparisons = 0;
		try {
			for (const pattern of patterns) {
				for (const trailingSlash of [undefined, "always", "never"] as const) {
					for (const catchAllFirst of [false, true]) {
						const specific = {
							pattern,
							localized: [
								["en", pattern],
								["de", `/de${pattern}`],
							] as Array<[string, string]>,
						};
						const catchAll = {
							pattern: "/:path(.*)?",
							localized: [
								["de", "/de/:path(.*)?"],
								["en", "/:path(.*)?"],
							] as Array<[string, string]>,
						};
						const code = createRuntimeFile({
							baseLocale: "en",
							locales: ["en", "de", "fr"],
							compilerOptions: {
								...defaultCompilerOptions,
								strategy: ["url", "baseLocale"],
								trailingSlash,
								urlPatterns: catchAllFirst
									? [catchAll, specific]
									: [specific, catchAll],
								routeStrategies: [
									{ match: pattern, exclude: true },
									{ match: "/:path(.*)?", strategy: ["url"] },
								],
							},
						}).replace(
							'import "@inlang/paraglide-js/urlpattern-polyfill";',
							""
						);
						// The reference keeps native construction/matching and all filling
						// logic, but enumerates the original arrays without pruning.
						const scan = code
							.replace(
								"return patternCandidates(urlPatternIndex, url, urlPatterns);",
								"return urlPatterns;"
							)
							.replace(
								"return patternCandidates(routeStrategyIndex, url, routeStrategies);",
								"return routeStrategies;"
							);
						expect(scan).not.toBe(code);
						expect(scan).not.toContain("return patternCandidates(");
						const load = (source: string) =>
							import(
								/* @vite-ignore */ "data:text/javascript;base64," +
									Buffer.from(
										source + `\n// isolated fixture ${moduleId++}`
									).toString("base64")
							);
						const indexed = await load(code);
						const original = await load(scan);
						for (const pathname of paths.flatMap((path) => [
							path,
							`/de${path}`,
						])) {
							for (const asObject of [false, true]) {
								const href = `https://user:pass@example.com${pathname}?redirect=%2Faccount#section`;
								const input = asObject ? new URL(href) : href;
								const operations = [
									(runtime: typeof indexed) =>
										runtime.localizeUrl(input, { locale: "de" }),
									(runtime: typeof indexed) =>
										runtime.localizeUrl(input, { locale: "fr" }),
									(runtime: typeof indexed) => runtime.deLocalizeUrl(input),
									(runtime: typeof indexed) =>
										runtime.extractLocaleFromUrl(input),
									(runtime: typeof indexed) =>
										runtime.findMatchingRouteStrategy(input),
									(runtime: typeof indexed) =>
										runtime.generateStaticLocalizedUrls([input]),
								];
								for (const operation of operations) {
									expect(
										outcome(() => operation(indexed)),
										`${pattern}, slash=${trailingSlash}, catchAllFirst=${catchAllFirst}, ${href}`
									).toEqual(outcome(() => operation(original)));
									comparisons++;
								}
							}
						}
					}
				}
			}
			expect(comparisons).toBe(31104);
		} finally {
			Object.defineProperty(globalThis, "URLPattern", {
				configurable: true,
				writable: true,
				value: previous,
			});
		}
	}, 30000);
}
