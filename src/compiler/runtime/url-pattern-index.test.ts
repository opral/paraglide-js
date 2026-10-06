import { expect, test } from "vitest";
import { URLPattern as PolyfillURLPattern } from "urlpattern-polyfill";
import { createParaglide } from "../create-paraglide.js";
import type { CompilerOptions } from "../compiler-options.js";
import { newProject } from "@inlang/sdk";

type PatternCtor = typeof URLPattern;

const nativeURLPattern = Reflect.get(globalThis, "URLPattern") as
	| PatternCtor
	| undefined;
const engines: Array<[string, PatternCtor]> = [];
let runtimeModuleNonce = 0;
if (
	typeof nativeURLPattern === "function" &&
	nativeURLPattern !== PolyfillURLPattern
) {
	engines.push(["native", nativeURLPattern]);
}
engines.push(["polyfill", PolyfillURLPattern as unknown as PatternCtor]);

async function withURLPattern<T>(ctor: PatternCtor, fn: () => Promise<T>) {
	const descriptor = Object.getOwnPropertyDescriptor(globalThis, "URLPattern");
	Object.defineProperty(globalThis, "URLPattern", {
		configurable: true,
		writable: true,
		value: ctor,
	});
	try {
		return await fn();
	} finally {
		if (descriptor) {
			Object.defineProperty(globalThis, "URLPattern", descriptor);
		} else {
			Reflect.deleteProperty(globalThis, "URLPattern");
		}
	}
}

async function withRuntime(
	options: {
		urlPatterns: Array<{
			pattern: string;
			localized: Array<[string, string]>;
		}>;
		routeStrategies?: CompilerOptions["routeStrategies"];
		trailingSlash?: "always" | "never";
	},
	ctor: PatternCtor,
	fn: (runtime: Awaited<ReturnType<typeof createParaglide>>) => Promise<void>
) {
	return withURLPattern(ctor, async () =>
		fn(
			await createParaglide({
				blob: await newProject({
					settings: { baseLocale: "en", locales: ["en", "de"] },
				}),
				cookieName: `pattern-index-test-${runtimeModuleNonce++}`,
				strategy: ["url", "baseLocale"],
				...options,
			})
		)
	);
}

for (const [engineName, ctor] of engines) {
	test(`${engineName} URLPattern keeps ordered routing and URL parts`, async () => {
		await withRuntime(
			{
				urlPatterns: [
					{
						pattern: "/specific-path",
						localized: [
							["en", "/specific-path"],
							["de", "/de/404"],
						],
					},
					{
						pattern: "/:path(.*)?",
						localized: [
							["en", "/:path(.*)?"],
							["de", "/de/:path(.*)?"],
						],
					},
				],
				routeStrategies: [
					{ match: "/specific-path", exclude: true },
					{ match: "/:path(.*)?", strategy: ["url"] },
				],
			},
			ctor,
			async (runtime) => {
				const input =
					"https://alice:secret@example.com/specific-path?redirect=%2Faccount#section";
				expect(runtime.localizeUrl(input, { locale: "de" }).href).toBe(
					"https://alice:secret@example.com/de/404?redirect=%2Faccount#section"
				);
				expect(
					runtime.deLocalizeUrl(
						"https://alice:secret@example.com/de/404?redirect=%2Faccount#section"
					).href
				).toBe(
					"https://alice:secret@example.com/specific-path?redirect=%2Faccount#section"
				);
				expect(runtime.extractLocaleFromUrl(input)).toBe("en");
				expect(
					runtime.isExcludedByRouteStrategy("https://example.com/specific-path")
				).toBe(true);
				expect(runtime.getStrategyForUrl("https://example.com/other")).toEqual([
					"url",
				]);
				expect(
					runtime
						.generateStaticLocalizedUrls(["https://example.com/specific-path"])
						.map((url) => url.href)
				).toEqual([
					"https://example.com/specific-path",
					"https://example.com/de/404",
				]);
			}
		);
	});

	test(`${engineName} URLPattern refreshes ordered indexes and same-URL caches after edits`, async () => {
		await withRuntime(
			{
				urlPatterns: [
					{
						pattern: "/:path(.*)?",
						localized: [
							["en", "/:path(.*)?"],
							["de", "/de/:path(.*)?"],
						],
					},
				],
				routeStrategies: [{ match: "/old/:slug", exclude: true }],
			},
			ctor,
			async (runtime) => {
				const url = "https://example.com/old/story";
				expect(runtime.extractLocaleFromUrl(url)).toBe("en");
				expect(runtime.localizeUrl(url, { locale: "de" }).pathname).toBe(
					"/de/old/story"
				);
				expect(runtime.isExcludedByRouteStrategy(url)).toBe(true);

				const pattern = runtime.urlPatterns[0]! as {
					pattern: string;
					localized: Array<[string, string]>;
				};
				pattern.pattern = "/new/:path(.*)?";
				pattern.localized[0]![1] = "/new/:path(.*)?";
				pattern.localized[1]![1] = "/de/new/:path(.*)?";
				(runtime.routeStrategies[0] as { match: string }).match = "/new/:slug";

				// Reuse the exact href so both one-entry result caches must notice
				// the config version change and the fast-path parse must be refreshed.
				expect(runtime.extractLocaleFromUrl(url)).toBe(undefined);
				expect(runtime.localizeUrl(url, { locale: "de" }).href).toBe(url);
				expect(runtime.isExcludedByRouteStrategy(url)).toBe(false);
				expect(
					runtime.localizeUrl("https://example.com/new/story", { locale: "de" })
						.pathname
				).toBe("/de/new/story");
			}
		);
	});

	test(`${engineName} URLPattern refreshes warmed winners after collection and reference edits`, async () => {
		await withRuntime(
			{
				urlPatterns: [
					{
						pattern: "/same/:slug",
						localized: [["de", "/same/:slug"]],
					},
				],
				routeStrategies: [{ match: "/same/:slug", strategy: ["url"] }],
			},
			ctor,
			async (runtime) => {
				const url = "https://example.com/same/story";
				expect(runtime.extractLocaleFromUrl(url)).toBe("de");
				expect(runtime.getStrategyForUrl(url)).toEqual(["url"]);

				// A pushed earlier pattern changes the extraction winner. Splicing it
				// back out must restore the original winner on this same cached URL.
				(
					runtime.urlPatterns as Array<{
						pattern: string;
						localized: Array<[string, string]>;
					}>
				).unshift({
					pattern: "/same/:slug",
					localized: [["en", "/same/:slug"]],
				});
				expect(runtime.extractLocaleFromUrl(url)).toBe("en");
				runtime.urlPatterns.splice(0, 1);
				expect(runtime.extractLocaleFromUrl(url)).toBe("de");

				// Replacing the localized array and its locale string changes the
				// first matching locale even though its pattern text is unchanged.
				const entry = runtime.urlPatterns[0]!;
				entry.localized = [["en", "/same/:slug"]];
				expect(runtime.extractLocaleFromUrl(url)).toBe("en");

				// Replacing a strategy object with the same match string must refresh
				// the warmed rule result as well as the candidate index snapshot.
				runtime.routeStrategies[0] = {
					match: "/same/:slug",
					strategy: ["baseLocale"],
				};
				expect(runtime.getStrategyForUrl(url)).toEqual(["baseLocale"]);
			}
		);
	});

	test(`${engineName} URLPattern keeps invalid-pattern errors ahead of later matches`, async () => {
		await withRuntime(
			{
				urlPatterns: [
					{ pattern: "/broken/:id(", localized: [] },
					{
						pattern: "/valid/:id",
						localized: [
							["en", "/valid/:id"],
							["de", "/de/valid/:id"],
						],
					},
				],
			},
			ctor,
			async (runtime) => {
				expect(() =>
					runtime.localizeUrl("https://example.com/valid/7", { locale: "de" })
				).toThrow();
			}
		);
	});

	test(`${engineName} URLPattern keeps malformed localized entries unconditional`, async () => {
		await withRuntime({ urlPatterns: [] }, ctor, async (runtime) => {
			(
				runtime.urlPatterns as unknown as Array<{
					pattern: string;
					localized: Array<[string, string]>;
				}>
			).push({
				pattern: "/unrelated/:slug",
				localized: [null as unknown as [string, string]],
			});

			// This route cannot be pruned by its path prefix: the original generic
			// scan would encounter the malformed localized entry and throw.
			expect(() =>
				runtime.localizeUrl("https://example.com/elsewhere", { locale: "de" })
			).toThrow();
		});
	});

	test(`${engineName} URLPattern preserves trailing-slash alias captures`, async () => {
		await withRuntime(
			{
				trailingSlash: "always",
				urlPatterns: [
					{
						pattern: "/:path(.*)",
						localized: [
							["en", "/:path(.*)"],
							["de", "/de/:path(.*)/details"],
						],
					},
				],
			},
			ctor,
			async (runtime) => {
				expect(
					runtime.localizeUrl("https://example.com/foo", { locale: "de" }).href
				).toBe("https://example.com/de/foo/details/");
			}
		);
	});

	test(`${engineName} URLPattern keeps file-host bases separate`, async () => {
		await withRuntime(
			{
				urlPatterns: [
					{
						pattern: "/section/:slug",
						localized: [
							["en", "/section/:slug"],
							["de", "/de/section/:slug"],
						],
					},
				],
				routeStrategies: [{ match: "/section/:slug", exclude: true }],
			},
			ctor,
			async (runtime) => {
				const first = new URL("file://server-one/section/story");
				const second = new URL("file://server-two/section/story");
				expect(runtime.extractLocaleFromUrl(first)).toBe("en");
				expect(runtime.extractLocaleFromUrl(second)).toBe("en");
				// Policy matching uses url.origin ("null" for both file hosts) as a
				// URLPattern base and therefore retains the preexisting Invalid URL
				// error. The locale extraction above exercises cache isolation safely.
			}
		);
	});
}

for (const [engineName, ctor] of engines) {
	test(`${engineName} URLPattern avoids unrelated late-route scans across APIs`, async () => {
		let constructions = 0;
		let executions = 0;
		class CountingURLPattern extends ctor {
			constructor(pattern?: string | URLPatternInit, baseURL?: string | URL) {
				if (baseURL === undefined) super(pattern as string | URLPatternInit);
				else super(pattern as string | URLPatternInit, String(baseURL));
				constructions++;
			}

			override exec(input: string | URL, baseURL?: string) {
				executions++;
				return baseURL === undefined
					? super.exec(input)
					: super.exec(input, baseURL);
			}
		}

		const urlPatterns = Array.from({ length: 67 }, (_, index) => ({
			pattern: `/route${index}/:slug`,
			localized: [
				["en", `/route${index}/:slug`] as [string, string],
				["de", `/de/route${index}/:slug`] as [string, string],
			],
		}));
		const routeStrategies = Array.from({ length: 67 }, (_, index) => ({
			match: `/route${index}/:slug`,
			exclude: true as const,
		}));

		await withRuntime(
			{ urlPatterns, routeStrategies },
			CountingURLPattern as unknown as PatternCtor,
			async (runtime) => {
				expect(
					runtime.localizeUrl("https://example.com/route66/story", {
						locale: "de",
					}).pathname
				).toBe("/de/route66/story");
				expect(
					runtime.deLocalizeUrl("https://example.com/de/route66/story").pathname
				).toBe("/route66/story");
				expect(
					runtime.extractLocaleFromUrl("https://example.com/de/route66/story")
				).toBe("de");
				expect(
					runtime.isExcludedByRouteStrategy("https://example.com/route66/story")
				).toBe(true);
				expect(
					runtime
						.generateStaticLocalizedUrls(["https://example.com/route66/story"])
						.map((url) => url.pathname)
				).toEqual(["/route66/story", "/de/route66/story"]);

				// Includes createParaglide's capability probe. URLPattern work across
				// five APIs stays proportional to the few matching patterns, not 67.
				expect(constructions).toBeLessThanOrEqual(4);
				expect(executions).toBeLessThanOrEqual(20);
			}
		);
	});
}
