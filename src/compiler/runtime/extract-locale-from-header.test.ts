import { test, expect } from "vitest";
import { createParaglide } from "../create-paraglide.js";
import { newProject } from "@inlang/sdk";

test("returns the preferred locale from Accept-Language header", async () => {
	const runtime = await createParaglide({
		blob: await newProject({
			settings: {
				baseLocale: "en",
				locales: ["en", "fr", "de"],
			},
		}),
	});

	// simple direct match
	const request = new Request("http://example.com", {
		headers: {
			"Accept-Language": "en-US;q=0.8,fr;q=0.9,de;q=0.6",
		},
	});
	const locale = runtime.extractLocaleFromHeader(request);
	expect(locale).toBe("fr");

	// language tag match
	const request2 = new Request("http://example.com", {
		headers: {
			"Accept-Language": "en-US;q=0.8,nl;q=0.9,de;q=0.7",
		},
	});
	const locale2 = runtime.extractLocaleFromHeader(request2);
	// Since "nl" isn't in our locales, and "de" has the highest q-value after "nl"
	expect(locale2).toBe("en");

	// no match
	const request3 = new Request("http://example.com", {
		headers: {
			"Accept-Language": "nl;q=0.9,es;q=0.6",
		},
	});
	const locale3 = runtime.extractLocaleFromHeader(request3);
	expect(locale3).toBeUndefined();
});

test("returns undefined if no Accept-Language header is present", async () => {
	const runtime = await createParaglide({
		blob: await newProject({
			settings: {
				baseLocale: "en",
				locales: ["en", "fr", "de"],
			},
		}),
	});

	const request = new Request("http://example.com");
	const locale = runtime.extractLocaleFromHeader(request);
	expect(locale).toBeUndefined();
});

test("canonicalizes matched locale from Accept-Language header", async () => {
	const runtime = await createParaglide({
		blob: await newProject({
			settings: {
				baseLocale: "en",
				locales: ["en", "pt-BR"],
			},
		}),
	});

	const request = new Request("http://example.com", {
		headers: {
			"Accept-Language": "pt-br, en;q=0.8",
		},
	});

	expect(runtime.extractLocaleFromHeader(request)).toBe("pt-BR");
});

// https://www.rfc-editor.org/rfc/rfc9110#section-12.4.2
test.each([
	// q=0 means "not acceptable"
	{ header: "fr;q=0", expected: undefined },
	{ header: "fr;q=0.000, nl", expected: undefined },
	// whitespace, uppercase Q and other parameters, with the weight still applied
	{ header: "fr; q=0.5, de;q=0.4", expected: "fr" },
	{ header: "fr; q=0.5, de;q=0.8", expected: "de" },
	{ header: "fr ; q = 0.5, de;q=0.4", expected: "fr" },
	{ header: "fr ; q = 0.5, de;q=0.8", expected: "de" },
	{ header: "fr;Q=0.9, de;q=0.8", expected: "fr" },
	{ header: "fr;Q=0.5, de;q=0.8", expected: "de" },
	{ header: "fr;level=1;q=0.9, de;q=0.8", expected: "fr" },
	{ header: "fr;level=1;q=0.5, de;q=0.8", expected: "de" },
	// delimiters inside quoted parameter values
	{ header: 'fr;note="x;q=1;y";q=0, de;q=0.5', expected: "de" },
	{ header: 'fr;note="x;q=0;y";q=0.9, de;q=0.5', expected: "fr" },
	{ header: 'fr;note="a,b";q=0.5, de;q=0.8', expected: "de" },
	{ header: 'fr;note="a\\";q=0";q=0.9, de;q=0.5', expected: "fr" },
	// an unclosed quote neither hides later ranges nor changes earlier ones
	{ header: 'en", fr', expected: "fr" },
	{ header: 'fr";q=0.9, de', expected: "de" },
	{ header: 'fr;note="a,b";q=0, de;q=0.5, en"', expected: "de" },
	{ header: 'fr;note="a,b";q=2, de;q=0.5, en"', expected: "de" },
	{ header: 'nl;note="x,fr,y";q=0, de;q=0.5, en"', expected: "de" },
	// weights outside the qvalue grammar
	{ header: "fr;q=abc, de;q=0.5", expected: "de" },
	{ header: "fr;q=2, de;q=0.5", expected: "de" },
	{ header: "fr;q=-1", expected: undefined },
	{ header: "fr;q=0.1234", expected: undefined },
	{ header: "fr;q=1.001", expected: undefined },
	{ header: "fr;q=1.0000", expected: undefined },
	{ header: "fr;q=.5, de;q=0.4", expected: "de" },
	{ header: "fr;q, de;q=0.5", expected: "de" },
	{ header: "de;q 0,en;q=0.5", expected: "en" },
	{ header: "fr;q 0.5, de;q=0.4", expected: "de" },
	{ header: "fr;q=, de;q=0.5", expected: "de" },
	// valid weights and ties
	{ header: "fr;q=1.000, de;q=0.5", expected: "fr" },
	{ header: "fr;q=1., de;q=0.5", expected: "fr" },
	{ header: "fr;q=0.001", expected: "fr" },
	{ header: "fr;q=0.8, de;q=0.8", expected: "fr" },
])(
	"applies Accept-Language quality values in $header",
	async ({ header, expected }) => {
		const runtime = await createParaglide({
			blob: await newProject({
				settings: {
					baseLocale: "en",
					locales: ["en", "fr", "de"],
				},
			}),
		});

		const request = new Request("http://example.com", {
			headers: {
				"Accept-Language": header,
			},
		});

		expect(runtime.extractLocaleFromHeader(request)).toBe(expected);
	}
);
