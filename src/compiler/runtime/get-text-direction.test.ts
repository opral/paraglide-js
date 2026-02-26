import { newProject } from "@inlang/sdk";
import { expect, test } from "vitest";
import { createParaglide } from "../create-paraglide.js";

const runtime = await createParaglide({
	blob: await newProject({
		settings: {
			baseLocale: "en",
			locales: ["en", "ar"],
		},
	}),
});

test("returns direction for a provided locale", () => {
	expect(runtime.getTextDirection("en")).toBe("ltr");
	expect(runtime.getTextDirection("ar")).toBe("rtl");
});

test("uses current locale when no locale is provided", () => {
	runtime.setLocale("ar", { reload: false });
	expect(runtime.getTextDirection()).toBe("rtl");
	runtime.setLocale("en", { reload: false });
	expect(runtime.getTextDirection()).toBe("ltr");
});

test("falls back when Intl.Locale text info is unavailable", () => {
	const OriginalLocale = Intl.Locale;

	class MockLocale {
		constructor(_locale: string) {}
	}

	Object.defineProperty(Intl, "Locale", {
		value: MockLocale,
		configurable: true,
	});

	try {
		expect(runtime.getTextDirection("ar")).toBe("rtl");
		expect(runtime.getTextDirection("ug")).toBe("rtl");
		expect(runtime.getTextDirection("sd")).toBe("rtl");
		expect(runtime.getTextDirection("ks")).toBe("rtl");
		expect(runtime.getTextDirection("en")).toBe("ltr");
	} finally {
		Object.defineProperty(Intl, "Locale", {
			value: OriginalLocale,
			configurable: true,
		});
	}
});
