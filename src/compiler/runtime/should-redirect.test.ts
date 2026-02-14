import { expect, test } from "vitest";
import { createParaglide } from "../create-paraglide.js";
import { newProject } from "@inlang/sdk";

test("shouldRedirect redirects to the strategy-preferred locale on the server", async () => {
	const runtime = await createParaglide({
		blob: await newProject({
			settings: {
				baseLocale: "en",
				locales: ["en", "fr"],
			},
		}),
		strategy: ["cookie", "url"],
		cookieName: "PARAGLIDE_LOCALE",
		urlPatterns: [
			{
				pattern: "https://example.com/:path(.*)?",
				localized: [
					["en", "https://example.com/en/:path(.*)?"],
					["fr", "https://example.com/fr/:path(.*)?"],
				],
			},
		],
	});

	const request = new Request("https://example.com/en/dashboard", {
		headers: {
			cookie: "PARAGLIDE_LOCALE=fr",
		},
	});

	const decision = await runtime.shouldRedirect({ request });

	expect(decision.shouldRedirect).toBe(true);
	expect(decision.redirectUrl?.href).toBe("https://example.com/fr/dashboard");
	expect(decision.locale).toBe("fr");
});

test("shouldRedirect does nothing when the URL already matches", async () => {
	const runtime = await createParaglide({
		blob: await newProject({
			settings: {
				baseLocale: "en",
				locales: ["en", "fr"],
			},
		}),
		strategy: ["cookie", "url"],
		cookieName: "PARAGLIDE_LOCALE",
		urlPatterns: [
			{
				pattern: "https://example.com/:path(.*)?",
				localized: [
					["en", "https://example.com/en/:path(.*)?"],
					["fr", "https://example.com/fr/:path(.*)?"],
				],
			},
		],
	});

	const request = new Request("https://example.com/fr/dashboard", {
		headers: {
			cookie: "PARAGLIDE_LOCALE=fr",
		},
	});

	const decision = await runtime.shouldRedirect({ request });

	expect(decision.shouldRedirect).toBe(false);
	expect(decision.redirectUrl).toBeUndefined();
	expect(decision.locale).toBe("fr");
});

test("shouldRedirect falls back to the browser URL when no input is provided", async () => {
	const runtime = await createParaglide({
		blob: await newProject({
			settings: {
				baseLocale: "en",
				locales: ["en", "de"],
			},
		}),
		strategy: ["url", "globalVariable"],
		isServer: "false",
		urlPatterns: undefined,
	});

	const originalWindow = globalThis.window;
	try {
		globalThis.window = {
			location: {
				href: "https://example.com/en/profile",
				origin: "https://example.com",
			},
		} as any;

		runtime.overwriteGetLocale(() => "de");

		const decision = await runtime.shouldRedirect();

		expect(decision.shouldRedirect).toBe(true);
		expect(decision.redirectUrl?.href).toBe("https://example.com/de/profile");
		expect(decision.locale).toBe("de");
	} finally {
		if (originalWindow === undefined) {
			Reflect.deleteProperty(globalThis, "window");
		} else {
			globalThis.window = originalWindow;
		}
	}
});

test("shouldRedirect({ url }) resolves locale using target URL routeStrategies on client", async () => {
	const runtime = await createParaglide({
		blob: await newProject({
			settings: {
				baseLocale: "en",
				locales: ["en", "fr"],
			},
		}),
		strategy: ["url", "cookie", "baseLocale"],
		cookieName: "PARAGLIDE_LOCALE",
		isServer: "false",
		urlPatterns: [
			{
				pattern: "https://example.com/:path(.*)?",
				localized: [
					["en", "https://example.com/en/:path(.*)?"],
					["fr", "https://example.com/fr/:path(.*)?"],
				],
			},
		],
		routeStrategies: [
			{
				match: "/dashboard/:path(.*)?",
				strategy: ["cookie", "baseLocale"],
			},
		],
	});

	const originalWindow = globalThis.window;
	const originalDocument = globalThis.document;

	try {
		globalThis.window = {
			location: {
				href: "https://example.com/dashboard",
				origin: "https://example.com",
			},
		} as any;
		globalThis.document = {
			cookie: "PARAGLIDE_LOCALE=fr",
		} as any;

		const decision = await runtime.shouldRedirect({
			url: "https://example.com/en/profile",
		});

		expect(decision.shouldRedirect).toBe(false);
		expect(decision.redirectUrl).toBeUndefined();
		expect(decision.locale).toBe("en");
	} finally {
		if (originalWindow === undefined) {
			Reflect.deleteProperty(globalThis, "window");
		} else {
			globalThis.window = originalWindow;
		}

		if (originalDocument === undefined) {
			Reflect.deleteProperty(globalThis, "document");
		} else {
			globalThis.document = originalDocument;
		}
	}
});

test("shouldRedirect never suggests a redirect without the url strategy", async () => {
	const runtime = await createParaglide({
		blob: await newProject({
			settings: {
				baseLocale: "en",
				locales: ["en", "fr"],
			},
		}),
		strategy: ["cookie"],
		cookieName: "PARAGLIDE_LOCALE",
	});

	const request = new Request("https://example.com/en/dashboard", {
		headers: {
			cookie: "PARAGLIDE_LOCALE=fr",
		},
	});

	const decision = await runtime.shouldRedirect({ request });

	expect(decision.shouldRedirect).toBe(false);
	expect(decision.redirectUrl).toBeUndefined();
	expect(decision.locale).toBe("fr");
});

test("shouldRedirect respects routeStrategies that disable url strategy per route", async () => {
	const runtime = await createParaglide({
		blob: await newProject({
			settings: {
				baseLocale: "en",
				locales: ["en", "fr"],
			},
		}),
		strategy: ["url", "cookie", "baseLocale"],
		cookieName: "PARAGLIDE_LOCALE",
		routeStrategies: [
			{
				match: "/dashboard/:path(.*)?",
				strategy: ["cookie", "baseLocale"],
			},
		],
	});

	const request = new Request("https://example.com/dashboard", {
		headers: {
			cookie: "PARAGLIDE_LOCALE=fr",
		},
	});

	const decision = await runtime.shouldRedirect({ request });

	expect(decision.shouldRedirect).toBe(false);
	expect(decision.redirectUrl).toBeUndefined();
	expect(decision.locale).toBe("fr");
});
