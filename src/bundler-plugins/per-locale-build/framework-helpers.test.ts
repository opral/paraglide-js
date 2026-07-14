import { describe, expect, test } from "vitest";
import {
	createTanStackStartFramework,
	getTanStackStartEffectiveRequestUrl,
	getPerLocaleBuildPrefix,
	prefixPerLocaleAssetUrl,
} from "./frameworks/tanstack-start.js";
import { getPerLocaleBuildLocaleId } from "./locale-id.js";

describe("per-locale build paths", () => {
	test("locale ids are readable, filesystem safe, and collision free", () => {
		expect(getPerLocaleBuildLocaleId("de")).toBe("de-6465");
		expect(getPerLocaleBuildLocaleId("pt-BR")).toBe("pt-BR-70742d4252");
		expect(getPerLocaleBuildLocaleId("中文")).toBe("__-e4b8ade69687");
		expect(getPerLocaleBuildLocaleId("en/us")).not.toBe(
			getPerLocaleBuildLocaleId("en?us")
		);
		expect(getPerLocaleBuildPrefix("de")).toBe("/__paraglide/de-6465");
	});

	test("prefixes same-origin asset URLs and rejects CDN URLs", () => {
		const prefix = getPerLocaleBuildPrefix("de");
		expect(prefixPerLocaleAssetUrl("/assets/app.js?v=1", prefix)).toBe(
			"/__paraglide/de-6465/assets/app.js?v=1"
		);
		expect(prefixPerLocaleAssetUrl("assets/app.js", prefix)).toBe(
			"/__paraglide/de-6465/assets/app.js"
		);
		expect(() =>
			prefixPerLocaleAssetUrl("https://cdn.example/assets/app.js", prefix)
		).toThrow("root-relative and relative");
		expect(() =>
			prefixPerLocaleAssetUrl("//cdn.example/assets/app.js", prefix)
		).toThrow("root-relative and relative");
		expect(prefixPerLocaleAssetUrl("/assets/app.js", "")).toBe(
			"/assets/app.js"
		);
	});
});

describe("TanStack Start request locale propagation", () => {
	test("uses a same-origin Referer for a TanStack server-function request", () => {
		const request = new Request("https://example.com/_serverFn/example", {
			headers: {
				Referer: "https://example.com/de/produkte?from=server-fn",
				"x-tsr-serverFn": "true",
			},
		});
		expect(getTanStackStartEffectiveRequestUrl(request).href).toBe(
			"https://example.com/de/produkte?from=server-fn"
		);
	});

	test("does not use Referer for an unmarked navigation without Fetch Metadata", () => {
		const request = new Request("https://example.com/en/products", {
			headers: { Referer: "https://example.com/de/produkte" },
		});
		expect(getTanStackStartEffectiveRequestUrl(request).href).toBe(request.url);
	});

	test.each([
		["a cross-origin Referer", "https://attacker.example/de"],
		["an invalid Referer", "not a url"],
	])("ignores %s", (_label, referer) => {
		const request = new Request("https://example.com/_serverFn/example", {
			headers: { Referer: referer, "x-tsr-serverFn": "true" },
		});
		expect(getTanStackStartEffectiveRequestUrl(request).href).toBe(request.url);
	});
});

test("generates one self-contained TanStack Start server adapter", () => {
	const files = createTanStackStartFramework().generatedFiles ?? {};
	const server = files["tanstack-start.server.js"];
	expect(Object.keys(files)).toEqual(["tanstack-start.server.js"]);
	expect(server).not.toContain("@inlang/paraglide-js");
	expect(server).toContain("cache: false");
	expect(server).toContain(getPerLocaleBuildLocaleId.toString());
	expect(server).toContain('from "@tanstack/react-start/server"');
	expect(server).toContain(
		"effectiveRequestUrl: getEffectiveRequestUrl(request)"
	);
});
