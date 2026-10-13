import { test, expect, vi } from "vitest";
import { createParaglide } from "../create-paraglide.js";
import { newProject } from "@inlang/sdk";

test("uses the locale from getLocale() if no locale is provided", async () => {
	const runtime = await createParaglide({
		blob: await newProject({
			settings: {
				baseLocale: "en",
				locales: ["en", "de"],
			},
		}),
		strategy: ["url", "globalVariable", "baseLocale"],
		urlPatterns: [
			{
				pattern: "http://:domain(.*)/:locale(de|en)?/:path(.*)?",
				localized: [
					["de", "http://:domain(.*)/de/:path(.*)?"],
					["en", "http://:domain(.*)/:path(.*)?"],
				],
			},
		],
	});

	runtime.overwriteGetLocale(() => "de");

	expect(runtime.localizeHref("/hello")).toBe("/de/hello");
	expect(runtime.deLocalizeHref("/de/hello")).toBe("/hello");
});

test("returns an absolute href if the provided href is absolute", async () => {
	const runtime = await createParaglide({
		blob: await newProject({
			settings: {
				baseLocale: "en",
				locales: ["en", "de"],
			},
		}),
		strategy: ["url", "globalVariable", "baseLocale"],
		urlPatterns: [
			{
				pattern: "http://:domain(.*)/:locale(de|en)?/:path(.*)?",
				localized: [
					["de", "http://:domain(.*)/de/:path(.*)?"],
					["en", "http://:domain(.*)/:path(.*)?"],
				],
			},
		],
	});

	expect(
		runtime.localizeHref("http://example.com/hello", { locale: "de" })
	).toBe("http://example.com/de/hello");
	expect(runtime.deLocalizeHref("http://example.com/de/hello")).toBe(
		"http://example.com/hello"
	);
});

test("localizeHref preserves protocol-relative authorities", async () => {
	const runtime = await createParaglide({
		blob: await newProject({
			settings: { baseLocale: "en", locales: ["en", "de"] },
		}),
		strategy: ["url", "baseLocale"],
	});
	runtime.overwriteGetLocale(() => "en");

	for (const protocol of ["http", "https"]) {
		runtime.overwriteGetUrlOrigin(() => `${protocol}://app.example.com`);
		for (const prefix of ["//", "/\\", "\\\\", "\\/", "///", "/\\/"]) {
			for (const authority of [
				"cdn.example.com:8443",
				"cdn.example.com:80",
				"cdn.example.com:443",
				"app.example.com",
				"user:p%40ss@app.example.com",
			]) {
				expect(
					runtime.localizeHref(`${prefix}${authority}/hello?q=1#section`, {
						locale: "de",
					})
				).toBe(`//${authority}/de/hello?q=1#section`);
			}
		}
	}
	expect(runtime.localizeHref("/hello?q=1#section", { locale: "de" })).toBe(
		"/de/hello?q=1#section"
	);
});

test("deLocalizeHref preserves protocol-relative authorities", async () => {
	const runtime = await createParaglide({
		blob: await newProject({
			settings: { baseLocale: "en", locales: ["en", "de"] },
		}),
		strategy: ["url", "baseLocale"],
	});

	for (const protocol of ["http", "https"]) {
		runtime.overwriteGetUrlOrigin(() => `${protocol}://app.example.com`);
		for (const prefix of ["//", "/\\", "\\\\", "\\/", "///", "/\\/"]) {
			for (const authority of [
				"cdn.example.com:8443",
				"cdn.example.com:80",
				"cdn.example.com:443",
				"app.example.com",
				"user:p%40ss@app.example.com",
			]) {
				expect(
					runtime.deLocalizeHref(`${prefix}${authority}/de/hello?q=1#section`)
				).toBe(`//${authority}/hello?q=1#section`);
			}
		}
	}
	expect(runtime.deLocalizeHref("/de/hello?q=1#section")).toBe(
		"/hello?q=1#section"
	);
});

test("classifies protocol-relative hrefs after URL whitespace normalization", async () => {
	const runtime = await createParaglide({
		blob: await newProject({
			settings: { baseLocale: "en", locales: ["en", "de"] },
		}),
		strategy: ["url", "baseLocale"],
	});
	runtime.overwriteGetLocale(() => "en");
	runtime.overwriteGetUrlOrigin(() => "https://app.example.com");

	for (const prefix of [
		"/\t/",
		"/\n/",
		"/\r\\",
		"/\t\\",
		" \t//",
		"\u0000//",
	]) {
		expect({
			localized: runtime.localizeHref(`${prefix}cdn.example.com/hello`, {
				locale: "de",
			}),
			deLocalized: runtime.deLocalizeHref(`${prefix}cdn.example.com/de/hello`),
		}).toEqual({
			localized: "//cdn.example.com/de/hello",
			deLocalized: "//cdn.example.com/hello",
		});
	}
	expect(
		runtime.localizeHref("/%2Fcdn.example.com/hello", { locale: "de" })
	).toBe("/de/%2Fcdn.example.com/hello");
	expect(runtime.deLocalizeHref("/de/%2Fcdn.example.com/hello")).toBe(
		"/%2Fcdn.example.com/hello"
	);
	runtime.overwriteGetUrlOrigin(() => "custom://app.example.com");
	expect(runtime.localizeHref("/\\hello", { locale: "de" })).toBe(
		"/de/\\hello"
	);
	expect(runtime.deLocalizeHref("/de/\\hello")).toBe("/\\hello");
});

test.each(["localizeHref", "deLocalizeHref"] as const)(
	"%s does not interpret file path segments as ports",
	async (helper) => {
		const runtime = await createParaglide({
			blob: await newProject({
				settings: { baseLocale: "en", locales: ["en", "de"] },
			}),
			strategy: ["url", "baseLocale"],
		});
		runtime.overwriteGetLocale(() => "en");
		runtime.overwriteGetUrlOrigin(() => "file:///app/");

		for (const [prefix, expectedPrefix] of [
			["///", "///"],
			["/\\/", "///"],
			["//localhost/", "///"],
			["//server/", "//server/"],
		]) {
			const href = `${prefix}docs:80/page?q=1#part`;
			const result =
				helper === "localizeHref"
					? runtime.localizeHref(href, { locale: "de" })
					: runtime.deLocalizeHref(href);
			const expected = `${expectedPrefix}${helper === "localizeHref" ? "de/" : ""}docs:80/page?q=1#part`;
			expect(result).toBe(expected);
			expect(new URL(result, "file:///app/").href).toBe(`file:${expected}`);
		}
	}
);

test("protocol-relative hrefs do not inherit the server fallback protocol", async () => {
	vi.stubGlobal("window", undefined);
	try {
		const runtime = await createParaglide({
			blob: await newProject({
				settings: { baseLocale: "en", locales: ["en", "de"] },
			}),
			strategy: ["url", "baseLocale"],
			// A distinct option gives these fallback tests a runtime whose origin
			// was not overwritten.
			isServer: "true",
		});
		runtime.overwriteGetLocale(() => "en");
		expect(runtime.getUrlOrigin()).toBe("http://fallback.com");

		for (const prefix of ["//", "/\\"]) {
			const localized = runtime.localizeHref(`${prefix}cdn.example.com/hello`, {
				locale: "de",
			});
			const deLocalized = runtime.deLocalizeHref(
				`${prefix}cdn.example.com/de/hello`
			);
			expect({ localized, deLocalized }).toEqual({
				localized: "//cdn.example.com/de/hello",
				deLocalized: "//cdn.example.com/hello",
			});
			expect(new URL(localized, "https://app.example.com").href).toBe(
				"https://cdn.example.com/de/hello"
			);
			expect(new URL(deLocalized, "https://app.example.com").href).toBe(
				"https://cdn.example.com/hello"
			);
		}
	} finally {
		vi.unstubAllGlobals();
	}
});

test.each(["localizeHref", "deLocalizeHref"] as const)(
	"%s preserves explicit default ports on the server",
	async (helper) => {
		const runtime = await createParaglide({
			blob: await newProject({
				settings: { baseLocale: "en", locales: ["en", "de"] },
			}),
			strategy: ["url", "baseLocale"],
			isServer: "true",
		});
		runtime.overwriteGetLocale(() => "en");
		expect(runtime.getUrlOrigin()).toBe("http://fallback.com");

		for (const prefix of ["//", "/\\", "/\t/"]) {
			for (const authority of [
				"cdn.example.com:80",
				"cdn.example.com:00080",
				"user:p%40ss@cdn.example.com:80",
				"[::1]:80",
				"user:p%40ss@[::1]:80",
			]) {
				const input = `${prefix}${authority}${helper === "localizeHref" ? "/docs" : "/de/docs"}?q=1#part`;
				const output =
					helper === "localizeHref"
						? runtime.localizeHref(input, { locale: "de" })
						: runtime.deLocalizeHref(input);
				const resolved = new URL(output, "https://app.example.com");
				expect(resolved.port).toBe("80");
				expect(resolved.href).toBe(
					new URL(
						`https://${authority}${helper === "localizeHref" ? "/de/docs" : "/docs"}?q=1#part`
					).href
				);
				expect(output.startsWith("//")).toBe(true);
			}
		}
	}
);

test.each([
	["80", "8080"],
	["8080", "80"],
])(
	"configured port changes from %s to %s take precedence",
	async (basePort, localizedPort) => {
		const runtime = await createParaglide({
			blob: await newProject({
				settings: { baseLocale: "en", locales: ["en", "de"] },
			}),
			strategy: ["url", "baseLocale"],
			urlPatterns: [
				{
					pattern: `http://example.com:${basePort}/:path(.*)?`,
					localized: [
						["en", `http://example.com:${basePort}/:path(.*)?`],
						["de", `http://de.example.com:${localizedPort}/:path(.*)?`],
					],
				},
			],
		});
		runtime.overwriteGetLocale(() => "en");
		runtime.overwriteGetUrlOrigin(() => "http://app.example.com");

		for (const prefix of ["//", "/\\", "/\n/"]) {
			expect(
				runtime.localizeHref(`${prefix}example.com:${basePort}/docs?q=1#part`, {
					locale: "de",
				})
			).toBe(
				new URL(`http://de.example.com:${localizedPort}/docs?q=1#part`).href
			);
			expect(
				runtime.deLocalizeHref(
					`${prefix}de.example.com:${localizedPort}/docs?q=1#part`
				)
			).toBe(new URL(`http://example.com:${basePort}/docs?q=1#part`).href);
		}
	}
);

test.each(["http", "https"])(
	"protocol-relative hrefs respect domain localization between http and %s",
	async (protocol) => {
		const runtime = await createParaglide({
			blob: await newProject({
				settings: { baseLocale: "en", locales: ["en", "de"] },
			}),
			strategy: ["url", "baseLocale"],
			urlPatterns: [
				{
					pattern: "http://example.com/:path(.*)?",
					localized: [
						["en", "http://example.com/:path(.*)?"],
						["de", `${protocol}://de.example.com/:path(.*)?`],
					],
				},
			],
		});
		runtime.overwriteGetLocale(() => "en");

		for (const prefix of ["//", "/\\", "/\t/"]) {
			runtime.overwriteGetUrlOrigin(() => "http://app.example.com");
			expect(
				runtime.localizeHref(`${prefix}example.com/hello?q=1#section`, {
					locale: "de",
				})
			).toBe(
				`${protocol === "http" ? "" : "https:"}//de.example.com/hello?q=1#section`
			);
			expect(
				runtime.localizeHref(`${prefix}example.com:80/hello`, { locale: "de" })
			).toBe(
				protocol === "http"
					? "//de.example.com:80/hello"
					: "https://de.example.com/hello"
			);
			runtime.overwriteGetUrlOrigin(() => `${protocol}://app.example.com`);
			expect(
				runtime.deLocalizeHref(`${prefix}de.example.com/hello?q=1#section`)
			).toBe(
				`${protocol === "http" ? "" : "http:"}//example.com/hello?q=1#section`
			);
			expect(
				runtime.deLocalizeHref(
					`${prefix}de.example.com:${protocol === "http" ? "80" : "443"}/hello`
				)
			).toBe(
				protocol === "http"
					? "//example.com:80/hello"
					: "http://example.com/hello"
			);
		}
	}
);

// useful if domain based localization is used for example
test("returns an absolute href if the provided href is relative but the origin of the localized href differs", async () => {
	const runtime = await createParaglide({
		blob: await newProject({
			settings: {
				baseLocale: "en",
				locales: ["en", "de"],
			},
		}),
		strategy: ["url", "globalVariable", "baseLocale"],
		urlPatterns: [
			{
				pattern: "http://example.com/:path(.*)?",
				localized: [
					["de", "http://de.example.com/:path(.*)?"],
					["en", "http://example.com/:path(.*)?"],
				],
			},
		],
	});

	// simulating routing from current en page to de page
	runtime.overwriteGetLocale(() => "en");
	runtime.overwriteGetUrlOrigin(() => "http://example.com");

	expect(runtime.localizeHref("/hello", { locale: "de" })).toBe(
		"http://de.example.com/hello"
	);
	expect(runtime.deLocalizeHref("http://de.example.com/hello")).toBe(
		"http://example.com/hello"
	);

	// simulating routing from current de page to en page
	runtime.overwriteGetLocale(() => "de");

	expect(runtime.localizeHref("/hello", { locale: "en" })).toBe(
		"http://example.com/hello"
	);
	expect(runtime.deLocalizeHref("http://example.com/hello")).toBe(
		"http://example.com/hello"
	);
});

// https://github.com/opral/inlang-paraglide-js/issues/362
test("adding a base path", async () => {
	const base = "shop";

	const runtime = await createParaglide({
		blob: await newProject({
			settings: {
				baseLocale: "en",
				locales: ["en", "de"],
			},
		}),
		strategy: ["url"],
		urlPatterns: [
			{
				pattern: `/{${base}/}?:path(.*)?`,
				localized: [
					["de", `/{${base}/}?de/:path(.*)?`],
					["en", `/{${base}/}?:path(.*)?`],
				],
			},
		],
	});

	// simulating the current locale to be en
	runtime.overwriteGetLocale(() => "en");

	expect(runtime.localizeHref("/about")).toBe("/shop/about");
	expect(runtime.deLocalizeHref("/about")).toBe("/shop/about");

	// simulating current locale to be de
	runtime.overwriteGetLocale(() => "de");
	expect(runtime.localizeHref("/about")).toBe("/shop/de/about");
	expect(runtime.deLocalizeHref("/de/about")).toBe("/shop/about");
});

test("default url patterns to improve out of the box experience", async () => {
	const runtime = await createParaglide({
		blob: await newProject({
			settings: {
				baseLocale: "en",
				locales: ["en", "de", "fr"],
			},
		}),
		isServer: "false",
		strategy: ["url"],
		urlPatterns: undefined,
	});

	// polyfilling window
	globalThis.window = { location: new URL("http://example.com") } as any;

	expect(runtime.urlPatterns).toStrictEqual([
		{
			pattern: ":protocol://:domain(.*)::port?/:path(.*)?",
			localized: [
				["de", ":protocol://:domain(.*)::port?/de/:path(.*)?"],
				["fr", ":protocol://:domain(.*)::port?/fr/:path(.*)?"],
				["en", ":protocol://:domain(.*)::port?/:path(.*)?"],
			],
		},
	]);

	// expecting the baseLocale to not be included in the url
	expect(runtime.localizeHref("/about", { locale: "en" })).toBe("/about");
	expect(runtime.localizeHref("/about", { locale: "de" })).toBe("/de/about");

	// expecting root path to work
	expect(runtime.localizeHref("/", { locale: "en" })).toBe("/");
	expect(runtime.localizeHref("/", { locale: "de" })).toBe("/de/");

	// expecting de-localization to work
	expect(runtime.deLocalizeHref("/de/")).toBe("/");
	expect(runtime.deLocalizeHref("/de/about")).toBe("/about");
	expect(runtime.deLocalizeHref("/about")).toBe("/about");

	// expecting localhost to work (for development)
	expect(runtime.localizeHref("http://localhost:5173/", { locale: "de" })).toBe(
		"http://localhost:5173/de/"
	);

	// de-localizing localhost
	expect(runtime.deLocalizeHref("http://localhost:5173/de")).toBe(
		"http://localhost:5173/"
	);

	// pathnames
	expect(
		runtime.localizeHref("http://localhost:5173/about", { locale: "de" })
	).toBe("http://localhost:5173/de/about");

	expect(runtime.deLocalizeHref("http://localhost:5173/de/about")).toBe(
		"http://localhost:5173/about"
	);
});

test("normalizes localized root hrefs and anchors", async () => {
	const runtime = await createParaglide({
		blob: await newProject({
			settings: {
				baseLocale: "en",
				locales: ["en", "de"],
			},
		}),
		isServer: "false",
		strategy: ["url"],
		trailingSlash: "never",
	});

	globalThis.window = { location: new URL("http://example.com") } as any;

	expect(runtime.localizeHref("/", { locale: "de" })).toBe("/de");
	expect(runtime.localizeHref("/#section", { locale: "de" })).toBe(
		"/de#section"
	);
	expect(runtime.deLocalizeHref("/de/")).toBe("/");
});

test("normalizes mixed-case explicit locales in localizeHref", async () => {
	const runtime = await createParaglide({
		blob: await newProject({
			settings: {
				baseLocale: "en",
				locales: ["en", "de"],
			},
		}),
		strategy: ["url"],
	});

	expect(runtime.localizeHref("/about", { locale: "DE" })).toBe("/de/about");

	expect(runtime.localizeHref("/de/about", { locale: "EN" })).toBe("/about");
});

test("keeps custom URLPattern path expressions on the generic fallback", async () => {
	const runtime = await createParaglide({
		blob: await newProject({
			settings: {
				baseLocale: "en",
				locales: ["en", "de"],
			},
		}),
		strategy: ["url"],
		urlPatterns: [
			{
				pattern: "/:slug(.)?",
				localized: [
					["en", "/:slug(.)?"],
					["de", "/de/:slug(.)?"],
				],
			},
		],
	});
	runtime.overwriteGetLocale(() => "en");
	runtime.overwriteGetUrlOrigin(() => "https://example.com");

	// `(.)` matches exactly one character in URLPattern. A prefix-only
	// implementation must not broaden this route into a catch-all.
	expect(runtime.localizeHref("/a", { locale: "de" })).toBe("/de/a");
	expect(runtime.localizeHref("/about", { locale: "de" })).toBe("/about");
});

test.each([undefined, "always", "never"] as const)(
	"default hrefs preserve slashes unless trailingSlash is %s",
	async (trailingSlash) => {
		const runtime = await createParaglide({
			blob: await newProject({
				settings: { baseLocale: "de", locales: ["de", "en"] },
			}),
			strategy: ["url", "baseLocale"],
			trailingSlash,
		});
		const paths = ["/", "/about/", "/contact/"];
		const suffix = trailingSlash === "never" ? "" : "/";
		expect(
			paths.flatMap((path) =>
				runtime.locales.map((locale) => runtime.localizeHref(path, { locale }))
			)
		).toEqual([
			"/",
			"/en" + suffix,
			"/about" + suffix,
			"/en/about" + suffix,
			"/contact" + suffix,
			"/en/contact" + suffix,
		]);
		expect(runtime.localizeHref("/about", { locale: "en" })).toBe(
			"/en/about" + (trailingSlash === "always" ? "/" : "")
		);
		expect(runtime.deLocalizeHref("/en/about/?q=test#section")).toBe(
			"/about" + suffix + "?q=test#section"
		);
		expect(
			runtime.localizeHref("/en/about/?q=test#section", { locale: "de" })
		).toBe("/about" + suffix + "?q=test#section");
	}
);

test("default routes remove detected locales after repeated leading separators", async () => {
	const runtime = await createParaglide({
		blob: await newProject({
			settings: { baseLocale: "en", locales: ["en", "de", "fr"] },
		}),
		strategy: ["url", "baseLocale"],
	});
	for (const suffix of ["", "/"]) {
		const input = `https://example.com//de/about${suffix}?q=test#section`;
		expect(runtime.extractLocaleFromUrl(input)).toBe("de");
		expect(runtime.localizeUrl(input, { locale: "en" }).href).toBe(
			`https://example.com/about${suffix}?q=test#section`
		);
		expect(runtime.localizeUrl(input, { locale: "fr" }).href).toBe(
			`https://example.com/fr/about${suffix}?q=test#section`
		);
		expect(runtime.deLocalizeUrl(input).href).toBe(
			`https://example.com/about${suffix}?q=test#section`
		);
	}
});
