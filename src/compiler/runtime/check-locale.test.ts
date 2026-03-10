import { newProject } from "@inlang/sdk";
import { expect, test } from "vitest";
import { createParaglide } from "../create-paraglide.js";
import type { Locale } from "./type-definitions.js";

test("toLocale canonicalizes case-insensitive matches without throwing", async () => {
	const runtime = await createParaglide({
		blob: await newProject({
			settings: {
				baseLocale: "en",
				locales: ["en", "pt-BR", "de-ch"],
			},
		}),
	});

	expect(runtime.toLocale("EN")).toBe("en");
	expect(runtime.toLocale("pT-bR")).toBe("pt-BR");
	expect(runtime.toLocale("de-CH")).toBe("de-ch");
	expect(runtime.toLocale("es")).toBeUndefined();
	expect(runtime.toLocale(null)).toBeUndefined();
	expect(runtime.toLocale(undefined)).toBeUndefined();
	expect(runtime.toLocale(123)).toBeUndefined();
	expect(runtime.toLocale({})).toBeUndefined();
});

test("isLocale still checks canonical locale casing", async () => {
	const runtime = await createParaglide({
		blob: await newProject({
			settings: {
				baseLocale: "en",
				locales: ["en", "pt-BR", "de-ch"],
			},
		}),
	});

	expect(runtime.isLocale("pt-BR")).toBe(true);
	expect(runtime.isLocale("EN")).toBe(false);
	expect(runtime.isLocale(null)).toBe(false);
});

test("isLocale returns false for non-existent locales", async () => {
	const runtime = await createParaglide({
		blob: await newProject({
			settings: {
				baseLocale: "en",
				locales: ["en", "pt-BR", "de-ch"],
			},
		}),
	});

	expect(runtime.isLocale("es")).toBe(false);
	expect(runtime.isLocale("xx")).toBe(false);
	expect(runtime.isLocale("")).toBe(false);
	expect(runtime.isLocale(undefined)).toBe(false);
	expect(runtime.isLocale(123)).toBe(false);
	expect(runtime.isLocale({})).toBe(false);
	expect(runtime.isLocale([])).toBe(false);
});

test("assertIsLocale throws if the locale is not available", async () => {
	const runtime = await createParaglide({
		blob: await newProject({
			settings: {
				baseLocale: "en",
				locales: ["en", "de"],
			},
		}),
	});

	expect(() => runtime.assertIsLocale("es")).toThrow();
});

test("assertIsLocale throws for non-string inputs", async () => {
	const runtime = await createParaglide({
		blob: await newProject({
			settings: {
				baseLocale: "en",
				locales: ["en", "de"],
			},
		}),
	});

	expect(() => runtime.assertIsLocale(null)).toThrow();
	expect(() => runtime.assertIsLocale(undefined)).toThrow();
	expect(() => runtime.assertIsLocale(123)).toThrow();
	expect(() => runtime.assertIsLocale({})).toThrow();
	expect(() => runtime.assertIsLocale([])).toThrow();
});

test("assertIsLocale passes if the locale is available", async () => {
	const runtime = await createParaglide({
		blob: await newProject({
			settings: {
				baseLocale: "en",
				locales: ["en", "de"],
			},
		}),
	});

	expect(() => runtime.assertIsLocale("en")).not.toThrow();
});

test("assertIsLocale return value is a Locale", async () => {
	const runtime = await createParaglide({
		blob: await newProject({
			settings: {
				baseLocale: "en",
				locales: ["en", "de"],
			},
		}),
	});

	const locale = runtime.assertIsLocale("en");
	locale satisfies Locale;
});

test("assertIsLocale is case-insensitive", async () => {
	const runtime = await createParaglide({
		blob: await newProject({
			settings: {
				baseLocale: "en",
				locales: ["en", "pt-BR", "de-ch"],
			},
		}),
	});

	expect(() => runtime.assertIsLocale("EN")).not.toThrow();
	expect(() => runtime.assertIsLocale("pt-br")).not.toThrow();
	expect(() => runtime.assertIsLocale("de-CH")).not.toThrow();

	expect(runtime.assertIsLocale("EN")).toBe("en");
	expect(runtime.assertIsLocale("pT-bR")).toBe("pt-BR");
	expect(runtime.assertIsLocale("de-CH")).toBe("de-ch");
});
