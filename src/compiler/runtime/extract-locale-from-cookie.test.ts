import { test, expect } from "vitest";
import { createParaglide } from "../create-paraglide.js";
import { newProject } from "@inlang/sdk";

test("returns undefined if document is not available", async () => {
	// @ts-expect-error - global variable definition
	globalThis.document = undefined;

	const runtime = await createParaglide({
		blob: await newProject({
			settings: {
				baseLocale: "en",
				locales: ["en", "de"],
			},
		}),
	});

	expect(runtime.extractLocaleFromCookie()).toBeUndefined();
});

test("matches the locale of a cookie", async () => {
	const runtime = await createParaglide({
		blob: await newProject({
			settings: {
				baseLocale: "en",
				locales: ["en", "de"],
			},
		}),
		strategy: ["cookie"],
		cookieName: "PARAGLIDE_LOCALE",
	});

	// @ts-expect-error - global variable definition
	globalThis.document = {};
	globalThis.document.cookie =
		"OTHER_COOKIE=fr; PARAGLIDE_LOCALE=de; ANOTHER_COOKIE=en; EXPIRES_COOKIE=es; Max-Age=3600";

	const locale = runtime.extractLocaleFromCookie();
	expect(locale).toBe("de");
});

test("caches the locale during immediate repeated cookie reads", async () => {
	const runtime = await createParaglide({
		blob: await newProject({
			settings: {
				baseLocale: "en",
				locales: ["en", "de"],
			},
		}),
		strategy: ["cookie"],
		cookieName: "PARAGLIDE_LOCALE",
	});

	let cookieReadCount = 0;
	// @ts-expect-error - global variable definition
	globalThis.document = {
		get cookie() {
			cookieReadCount += 1;
			return "OTHER_COOKIE=fr; PARAGLIDE_LOCALE=de; ANOTHER_COOKIE=en;";
		},
	};

	expect(runtime.extractLocaleFromCookie()).toBe("de");
	expect(runtime.extractLocaleFromCookie()).toBe("de");
	expect(cookieReadCount).toBe(1);
});

test("cache expires after a microtask", async () => {
	const runtime = await createParaglide({
		blob: await newProject({
			settings: {
				baseLocale: "en",
				locales: ["en", "de"],
			},
		}),
		strategy: ["cookie"],
		cookieName: "PARAGLIDE_LOCALE",
	});

	let cookie = "PARAGLIDE_LOCALE=en;";
	let cookieReadCount = 0;
	// @ts-expect-error - global variable definition
	globalThis.document = {
		get cookie() {
			cookieReadCount += 1;
			return cookie;
		},
	};

	expect(runtime.extractLocaleFromCookie()).toBe("en");
	cookie = "PARAGLIDE_LOCALE=de;";
	expect(runtime.extractLocaleFromCookie()).toBe("en");

	await Promise.resolve();

	expect(runtime.extractLocaleFromCookie()).toBe("de");
	expect(cookieReadCount).toBe(2);
});

test("clears the cache after setLocale writes the cookie", async () => {
	const runtime = await createParaglide({
		blob: await newProject({
			settings: {
				baseLocale: "en",
				locales: ["en", "de"],
			},
		}),
		strategy: ["cookie"],
		cookieName: "PARAGLIDE_LOCALE",
		isServer: "false",
	});

	let cookie = "PARAGLIDE_LOCALE=en;";
	let cookieReadCount = 0;
	// @ts-expect-error - global variable definition
	globalThis.document = {
		get cookie() {
			cookieReadCount += 1;
			return cookie;
		},
		set cookie(value) {
			cookie = value;
		},
	};
	(globalThis as any).window = {
		location: { href: "https://example.com", reload() {} },
	};

	expect(runtime.extractLocaleFromCookie()).toBe("en");
	runtime.setLocale("de", { reload: false });
	expect(runtime.extractLocaleFromCookie()).toBe("de");
	expect(cookieReadCount).toBe(2);
});

test("escapes regex characters in cookie names", async () => {
	const runtime = await createParaglide({
		blob: await newProject({
			settings: {
				baseLocale: "en",
				locales: ["en", "de"],
			},
		}),
		strategy: ["cookie"],
		cookieName: "PARAGLIDE.LOCALE[app]",
	});

	// @ts-expect-error - global variable definition
	globalThis.document = {};
	globalThis.document.cookie =
		"PARAGLIDE_LOCALE_APP_=en;PARAGLIDE.LOCALE[app]=de;";

	expect(runtime.extractLocaleFromCookie()).toBe("de");
});

test("returns undefined for an empty cookie locale", async () => {
	const runtime = await createParaglide({
		blob: await newProject({
			settings: {
				baseLocale: "en",
				locales: ["en", "de"],
			},
		}),
		strategy: ["cookie"],
		cookieName: "PARAGLIDE_LOCALE",
	});

	// @ts-expect-error - global variable definition
	globalThis.document = {};
	globalThis.document.cookie = "OTHER_COOKIE=de;PARAGLIDE_LOCALE=;";

	expect(runtime.extractLocaleFromCookie()).toBeUndefined();
});

test("canonicalizes cookie locale casing", async () => {
	const runtime = await createParaglide({
		blob: await newProject({
			settings: {
				baseLocale: "en",
				locales: ["en", "de-CH"],
			},
		}),
		strategy: ["cookie"],
		cookieName: "PARAGLIDE_LOCALE",
	});

	// @ts-expect-error - global variable definition
	globalThis.document = {};
	globalThis.document.cookie = "PARAGLIDE_LOCALE=de-ch;";

	expect(runtime.extractLocaleFromCookie()).toBe("de-CH");
});

// useful scenario that avoids throws if the cookie uses an old locale that is
// not supported anymore or development on localhost shares multiple apps with
// different locales
test("returns undefined if the locale is not defined in the locales", async () => {
	const runtime = await createParaglide({
		blob: await newProject({
			settings: {
				baseLocale: "en",
				locales: ["en", "de"],
			},
		}),
		strategy: ["cookie"],
		cookieName: "PARAGLIDE_LOCALE",
	});

	// @ts-expect-error - global variable definition
	globalThis.document = {};
	globalThis.document.cookie = "PARAGLIDE_LOCALE=fr;";

	const locale = runtime.extractLocaleFromCookie();
	expect(locale).toBeUndefined();
});
