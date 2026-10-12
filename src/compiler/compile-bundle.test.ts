import { test, expect } from "vitest";
import {
	compileBundle,
	compileBundleForVite,
	toBundleInputTypeAliasName,
} from "./compile-bundle.js";
import type { BundleNested, ProjectSettings } from "@inlang/sdk";
import { toSafeModuleId } from "./safe-module-id.js";
import { perLocaleBuildStaticLocaleExpression } from "./per-locale-build.js";

function createPlainTextBundle(
	id: string,
	textByLocale: Record<string, string>,
	declarations: BundleNested["declarations"] = []
): BundleNested {
	return {
		id,
		declarations,
		messages: Object.entries(textByLocale).map(([locale, value]) => ({
			id: `${id}-${locale}`,
			bundle_id: id,
			locale,
			selectors: [],
			variants: [
				{
					id: `${id}-${locale}-variant`,
					message_id: `${id}-${locale}`,
					matches: [],
					pattern: [{ type: "text" as const, value }],
				},
			],
		})),
	};
}

test("compiles to jsdoc", async () => {
	const mockBundle: BundleNested = {
		id: "blue_moon_bottle",
		declarations: [{ type: "input-variable", name: "age" }],
		messages: [
			{
				id: "message-id",
				bundle_id: "blue_moon_bottle",
				locale: "en",
				selectors: [],
				variants: [
					{
						id: "1",
						message_id: "message-id",
						matches: [],
						pattern: [
							{ type: "text", value: "Hello" },
							{
								type: "expression",
								arg: { type: "variable-reference", name: "age" },
							},
						],
					},
				],
			},
		],
	};

	const result = compileBundle({
		inlineMessages: true,
		fallbackMap: {
			en: "en",
			"en-US": "en",
		},
		bundle: mockBundle,
		messageReferenceExpression: (locale) =>
			`${toSafeModuleId(locale)}.blue_moon_bottle`,
		settings: {
			locales: ["en", "en-US"],
		} as ProjectSettings,
	});

	expect(result.bundle.code).toMatchInlineSnapshot(
		`
		"/**
		* | output |
		* | --- |
		* | "Hello{age}" |
		*
		* @param {Blue_Moon_BottleInputs} inputs
		* @param {{ locale?: "en" | "en-US" }} options
		* @returns {LocalizedString}
		*/
		export const blue_moon_bottle = /** @type {((inputs: Blue_Moon_BottleInputs, options?: { locale?: "en" | "en-US" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Blue_Moon_BottleInputs, { locale?: "en" | "en-US" }, {}>} */ ((inputs, options = {}) => {
			const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
			if (locale === "en") return en.blue_moon_bottle(inputs)
			return en_us2.blue_moon_bottle(inputs)
		});"
	`
	);
});

test("uses the base locale as the exhaustive locale branch", () => {
	const mockBundle: BundleNested = {
		id: "greeting",
		declarations: [],
		messages: [
			{
				id: "message-id",
				bundle_id: "greeting",
				locale: "en",
				selectors: [],
				variants: [
					{
						id: "variant-id",
						message_id: "message-id",
						matches: [],
						pattern: [{ type: "text", value: "Hello" }],
					},
				],
			},
		],
	};

	const result = compileBundle({
		inlineMessages: true,
		fallbackMap: {
			fr: "en",
			de: "en",
			en: undefined,
			ja: "en",
		},
		bundle: mockBundle,
		messageReferenceExpression: (locale) => `${locale}_greeting`,
		settings: {
			baseLocale: "en",
			locales: ["fr", "de", "en", "ja"],
		} as ProjectSettings,
	});

	expect(result.bundle.code).toContain(
		[
			'if (locale === "fr") return fr_greeting(inputs)',
			'if (locale === "de") return de_greeting(inputs)',
			'if (locale === "ja") return ja_greeting(inputs)',
			'return /** @type {LocalizedString} */ ("Hello")',
		].join("\n\t")
	);
});

test("inlines static text with safe escaping and preserves missing-locale fallbacks", async () => {
	const id = "$p@44🍌";
	const safeId = toSafeModuleId(id);
	const trickyText =
		'quote " backslash \\ backtick ` interpolation ${danger}\r\n</script><script>alert(1)</script> */\u2028\u2029';
	const compiledText = trickyText.replace(/\r\n?/g, "\n");
	const bundle = createPlainTextBundle(id, { en: trickyText, de: "Hallo" }, [
		{ type: "input-variable", name: "unused" },
	]);
	const result = compileBundle({
		inlineMessages: true,
		bundle,
		fallbackMap: { en: undefined, de: "en", fr: "en" },
		messageReferenceExpression: (locale, bundleId) =>
			`${toSafeModuleId(locale)}_${toSafeModuleId(bundleId)}`,
		settings: {
			baseLocale: "en",
			locales: ["en", "de", "fr"],
		} as ProjectSettings,
		experimentalMiddlewareLocaleSplitting: true,
	});

	expect(result.bundle.code).toContain(
		`if (locale === "de") return /** @type {LocalizedString} */ (${JSON.stringify("Hallo")})`
	);
	expect(result.bundle.code).toContain(
		`if (locale === "fr") return fr_${safeId}(inputs)`
	);
	expect(result.bundle.code).toContain(
		`return /** @type {LocalizedString} */ (${JSON.stringify(compiledText)})`
	);
	expect(result.bundle.code).toContain(`trackMessageCall("${safeId}", locale)`);
	expect(result.bundle.code).toContain(
		`globalThis).__paraglide.ssr.${safeId}(inputs)`
	);
	expect(result.messages.en?.code).toBeDefined();

	const enMessage = result.messages.en;
	const deMessage = result.messages.de;
	if (!enMessage || !deMessage) throw new Error("Expected compiled messages");
	const moduleSource = `
const getLocale = () => "en";
const trackMessageCall = () => {};
const experimentalMiddlewareLocaleSplitting = false;
const isServer = true;
const experimentalStaticLocale = undefined;
const en_${safeId} = ${enMessage.code.replace(/;\s*$/, "")};
const de_${safeId} = ${deMessage.code.replace(/;\s*$/, "")};
const fr_${safeId} = en_${safeId};
${result.bundle.code}
`;
	const module = await import(
		"data:text/javascript;charset=utf-8," + encodeURIComponent(moduleSource)
	);
	const message = module[id];
	const unreadInput = new Proxy(
		{},
		{
			get: () => {
				throw new Error("static text should not read inputs");
			},
		}
	);

	expect(message(unreadInput, { locale: "en" })).toBe(compiledText);
	expect(message({}, { locale: "de" })).toBe("Hallo");
	expect(message({}, { locale: "fr" })).toBe(compiledText);
});

test("leaves markup and multi-variant messages on their message functions", () => {
	const markupBundle: BundleNested = {
		id: "notice",
		declarations: [],
		messages: [
			{
				id: "notice-en",
				bundle_id: "notice",
				locale: "en",
				selectors: [],
				variants: [
					{
						id: "notice-en-variant",
						message_id: "notice-en",
						matches: [],
						pattern: [
							{
								type: "markup-start",
								name: "strong",
								options: [],
								attributes: [],
							},
							{ type: "text", value: "Hello" },
							{
								type: "markup-end",
								name: "strong",
								options: [],
								attributes: [],
							},
						],
					},
				],
			},
		],
	};
	const markupResult = compileBundle({
		inlineMessages: true,
		bundle: markupBundle,
		fallbackMap: { en: undefined },
		messageReferenceExpression: (locale) => `${locale}_notice`,
		settings: { baseLocale: "en", locales: ["en"] } as ProjectSettings,
	});
	expect(markupResult.bundle.code).toContain("return en_notice(inputs)");
	expect(markupResult.bundle.code).not.toContain(
		'return /** @type {LocalizedString} */ ("Hello")'
	);

	const multiVariantBundle: BundleNested = {
		id: "item_count",
		declarations: [{ type: "input-variable", name: "count" }],
		messages: ["en", "de"].map((locale) => ({
			id: `item_count-${locale}`,
			bundle_id: "item_count",
			locale,
			selectors: [{ type: "variable-reference", name: "count" }],
			variants: [
				{
					id: `item_count-${locale}-zero`,
					message_id: `item_count-${locale}`,
					matches: [{ type: "literal-match", key: "count", value: "0" }],
					pattern: [{ type: "text", value: "No items" }],
				},
				{
					id: `item_count-${locale}-other`,
					message_id: `item_count-${locale}`,
					matches: [{ type: "catchall-match", key: "count" }],
					pattern: [{ type: "text", value: "Some items" }],
				},
			],
		})),
	};
	const multiVariantResult = compileBundle({
		inlineMessages: true,
		bundle: multiVariantBundle,
		fallbackMap: { en: undefined, de: "en" },
		messageReferenceExpression: (locale) => `${locale}_item_count`,
		settings: { baseLocale: "en", locales: ["en", "de"] } as ProjectSettings,
	});
	expect(multiVariantResult.bundle.code).toContain(
		'if (locale === "de") return de_item_count(inputs)'
	);
	expect(multiVariantResult.bundle.code).toContain(
		"return en_item_count(inputs)"
	);
});

test("keeps static text message references in a per-locale build", () => {
	const bundle = createPlainTextBundle("greeting", {
		en: "Hello",
		de: "Hallo",
	});
	const result = compileBundle({
		inlineMessages: true,
		bundle,
		fallbackMap: { en: undefined, de: "en" },
		messageReferenceExpression: (locale) => `${locale}_greeting`,
		settings: { baseLocale: "en", locales: ["en", "de"] } as ProjectSettings,
		experimentalStaticLocale: perLocaleBuildStaticLocaleExpression,
	});

	expect(result.bundle.code).toContain(
		'if (locale === "de") return de_greeting(inputs)'
	);
	expect(result.bundle.code).toContain("return en_greeting(inputs)");
});

test("marks an unused input parameter as used when every branch is inlined", () => {
	const bundle = createPlainTextBundle("greeting", { en: "Hello" }, [
		{ type: "input-variable", name: "unused" },
	]);
	const result = compileBundle({
		inlineMessages: true,
		bundle,
		fallbackMap: { en: undefined },
		messageReferenceExpression: (locale) => `${locale}_greeting`,
		settings: { baseLocale: "en", locales: ["en"] } as ProjectSettings,
	});

	expect(result.bundle.code).toContain("void inputs;");
	expect(result.bundle.code).toContain(
		'return /** @type {LocalizedString} */ ("Hello")'
	);
});

test("does not treat inherited object properties as inline locale messages", () => {
	const bundle = createPlainTextBundle("greeting", { en: "Hello" });
	const result = compileBundle({
		inlineMessages: true,
		bundle,
		fallbackMap: { en: undefined, toString: "en", constructor: "en" },
		messageReferenceExpression: (locale) =>
			`${toSafeModuleId(locale)}_greeting`,
		settings: {
			baseLocale: "en",
			locales: ["en", "toString", "constructor"],
		} as ProjectSettings,
	});

	expect(result.bundle.code).toContain(
		`if (locale === "toString") return ${toSafeModuleId("toString")}_greeting(inputs)`
	);
	expect(result.bundle.code).toContain(
		`if (locale === "constructor") return ${toSafeModuleId("constructor")}_greeting(inputs)`
	);
	expect(result.bundle.code).toContain(
		'return /** @type {LocalizedString} */ ("Hello")'
	);
});

test("emits middleware locale splitting hooks when enabled", () => {
	const mockBundle: BundleNested = {
		id: "blue_moon_bottle",
		declarations: [{ type: "input-variable", name: "age" }],
		messages: [
			{
				id: "message-id",
				bundle_id: "blue_moon_bottle",
				locale: "en",
				selectors: [],
				variants: [
					{ id: "1", message_id: "message-id", matches: [], pattern: [] },
				],
			},
		],
	};

	const result = compileBundle({
		inlineMessages: true,
		fallbackMap: { en: "en" },
		bundle: mockBundle,
		messageReferenceExpression: (locale) =>
			`${toSafeModuleId(locale)}.blue_moon_bottle`,
		settings: {
			locales: ["en"],
		} as ProjectSettings,
		experimentalMiddlewareLocaleSplitting: true,
	});

	expect(result.bundle.code).toContain(
		"if (experimentalMiddlewareLocaleSplitting && isServer === false)"
	);
	expect(result.bundle.code).toContain(
		'trackMessageCall("blue_moon_bottle", locale)'
	);
	expect(result.bundle.code).toContain(
		"globalThis).__paraglide.ssr.blue_moon_bottle(inputs)"
	);
});

test("emits the per-locale build marker inside the message function", () => {
	const mockBundle: BundleNested = {
		id: "greeting",
		declarations: [],
		messages: [
			{
				id: "greeting-en",
				bundle_id: "greeting",
				locale: "en",
				selectors: [],
				variants: [
					{
						id: "greeting-en-variant",
						message_id: "greeting-en",
						matches: [],
						pattern: [{ type: "text", value: "hello" }],
					},
				],
			},
			{
				id: "greeting-de",
				bundle_id: "greeting",
				locale: "de",
				selectors: [],
				variants: [
					{
						id: "greeting-de-variant",
						message_id: "greeting-de",
						matches: [],
						pattern: [{ type: "text", value: "hallo" }],
					},
				],
			},
		],
	};
	const expression = perLocaleBuildStaticLocaleExpression;
	const result = compileBundle({
		inlineMessages: true,
		bundle: mockBundle,
		fallbackMap: { en: undefined, de: "en" },
		messageReferenceExpression: (locale) => `${locale}_greeting`,
		settings: { locales: ["en", "de"] } as ProjectSettings,
		experimentalStaticLocale: expression,
	});

	expect(result.bundle.code).toContain(
		`const locale = ${expression} ?? options.locale ?? getLocale()`
	);
	expect(result.bundle.code).toContain(
		`if (${expression} !== undefined && options.locale !== undefined && options.locale !== ${expression}) console.warn(`
	);
	expect(result.bundle.code).toContain("full document navigation");
});

test("compiles to jsdoc with missing translation", async () => {
	const mockBundle: BundleNested = {
		id: "blue_moon_bottle",
		declarations: [{ type: "input-variable", name: "age" }],
		messages: [
			{
				id: "message-id",
				bundle_id: "blue_moon_bottle",
				locale: "en",
				selectors: [],
				variants: [
					{
						id: "1",
						message_id: "message-id",
						matches: [],
						pattern: [
							{ type: "text", value: "Hello" },
							{
								type: "expression",
								arg: { type: "variable-reference", name: "age" },
							},
						],
					},
				],
			},
		],
	};

	const result = compileBundle({
		inlineMessages: true,
		fallbackMap: {
			en: "en",
			"en-US": "en",
		},
		bundle: mockBundle,
		messageReferenceExpression: (locale) =>
			`${toSafeModuleId(locale)}.blue_moon_bottle`,
		settings: {
			locales: ["en", "en-US", "fr"],
		} as ProjectSettings,
	});

	expect(result.bundle.code).toMatchInlineSnapshot(
		`
		"/**
		* | output |
		* | --- |
		* | "Hello{age}" |
		*
		* @param {Blue_Moon_BottleInputs} inputs
		* @param {{ locale?: "en" | "en-US" }} options
		* @returns {LocalizedString}
		*/
		export const blue_moon_bottle = /** @type {((inputs: Blue_Moon_BottleInputs, options?: { locale?: "en" | "en-US" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Blue_Moon_BottleInputs, { locale?: "en" | "en-US" }, {}>} */ ((inputs, options = {}) => {
			const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
			if (locale === "en") return en.blue_moon_bottle(inputs)
			if (locale === "en-US") return en_us2.blue_moon_bottle(inputs)
			return /** @type {LocalizedString} */ ("blue_moon_bottle")
		});"
	`
	);
});

// https://github.com/opral/inlang-paraglide-js/issues/285
test("compiles bundles with arbitrary module identifiers", async () => {
	const mockBundle: BundleNested = {
		id: "$p@44🍌",
		declarations: [{ type: "input-variable", name: "age" }],
		messages: [
			{
				id: "message-id",
				bundle_id: "$p@44🍌",
				locale: "en",
				selectors: [],
				variants: [
					{
						id: "1",
						message_id: "message-id",
						matches: [],
						pattern: [
							{ type: "text", value: "Hello" },
							{
								type: "expression",
								arg: { type: "variable-reference", name: "age" },
							},
						],
					},
				],
			},
		],
	};

	const result = compileBundle({
		inlineMessages: true,
		fallbackMap: {},
		bundle: mockBundle,
		messageReferenceExpression: (locale) =>
			`${toSafeModuleId(locale)}.blue_moon_bottle`,
	});

	expect(result.bundle.code).includes(
		`export { ${toSafeModuleId("$p@44🍌")} as "$p@44🍌" }`
	);
});

test("keeps generated input typedef names collision-free for repeated underscores", () => {
	expect(toBundleInputTypeAliasName("foo_bar")).toBe("Foo_BarInputs");
	expect(toBundleInputTypeAliasName("foo__bar")).toBe("Foo__BarInputs");
	expect(toBundleInputTypeAliasName("foo_bar")).not.toBe(
		toBundleInputTypeAliasName("foo__bar")
	);
});

test("handles message pattern with duplicate variable references", async () => {
	const mockBundle: BundleNested = {
		id: "date_last_days",
		declarations: [
			{ type: "input-variable", name: "days" },
			{ type: "input-variable", name: "days" },
		],
		messages: [
			{
				id: "date_last_days",
				bundle_id: "date_last_days",
				locale: "en",
				selectors: [],
				variants: [
					{
						id: "1",
						message_id: "date_last_days",
						matches: [],
						pattern: [
							{ type: "text", value: "Last " },
							{
								type: "expression",
								arg: { type: "variable-reference", name: "days" },
							},
							{ type: "text", value: " days, showing " },
							{
								type: "expression",
								arg: { type: "variable-reference", name: "days" },
							},
							{ type: "text", value: " items" },
						],
					},
				],
			},
		],
	};

	const result = compileBundle({
		inlineMessages: true,
		fallbackMap: {
			en: "en",
		},
		bundle: mockBundle,
		messageReferenceExpression: (locale) =>
			`${toSafeModuleId(locale)}.date_last_days`,
	});

	// The JSDoc should not have duplicate parameters
	expect(result.bundle.code).toContain("@param {Date_Last_DaysInputs} inputs");
	expect(result.bundle.code).not.toContain(
		"days: NonNullable<unknown>, days: NonNullable<unknown>"
	);

	// Check that the pattern is compiled correctly
	const enMessage = result.messages?.en;
	expect(enMessage).toBeDefined();
	expect(enMessage?.code).toContain(
		"Last ${i?.days} days, showing ${i?.days} items"
	);
});

test("adds .parts() to bundle functions when markup exists", async () => {
	const mockBundle: BundleNested = {
		id: "notice",
		declarations: [{ type: "input-variable", name: "count" }],
		messages: [
			{
				id: "notice-id",
				bundle_id: "notice",
				locale: "en",
				selectors: [],
				variants: [
					{
						id: "1",
						message_id: "notice-id",
						matches: [],
						pattern: [
							{
								type: "markup-start",
								name: "strong",
								options: [],
								attributes: [],
							},
							{
								type: "expression",
								arg: { type: "variable-reference", name: "count" },
							},
							{ type: "text", value: " items" },
							{
								type: "markup-end",
								name: "strong",
								options: [],
								attributes: [],
							},
						],
					},
				],
			},
		],
	};

	const result = compileBundle({
		inlineMessages: true,
		fallbackMap: {
			en: undefined,
		},
		bundle: mockBundle,
		messageReferenceExpression: (locale) => `${toSafeModuleId(locale)}.notice`,
		settings: {
			locales: ["en"],
		} as ProjectSettings,
	});
	const compiledEnMessage = result.messages.en;
	if (!compiledEnMessage) {
		throw new Error("Expected compiled english message");
	}

	const moduleSource = `
const getLocale = () => "en";
const trackMessageCall = () => {};
const experimentalMiddlewareLocaleSplitting = false;
const isServer = true;
const experimentalStaticLocale = undefined;
const en = {
	notice: ${compiledEnMessage.code.replace(/;\s*$/, "")}
};
${result.bundle.code}
`;

	const { notice } = await import(
		"data:text/javascript;base64," + btoa(moduleSource)
	);

	expect(notice({ count: 3 })).toBe("3 items");
	expect(notice.parts({ count: 3 })).toEqual([
		{ type: "markup-start", name: "strong", options: {}, attributes: {} },
		{ type: "text", value: "3" },
		{ type: "text", value: " items" },
		{ type: "markup-end", name: "strong", options: {}, attributes: {} },
	]);
	expect(result.bundle.code).toContain(
		'MessageMetadata<NoticeInputs, { locale?: "en" }, { strong: { options: {}; attributes: {}; children: true } }>'
	);
});

test("low-level compilation preserves references without a layout opt-in", () => {
	const result = compileBundle({
		bundle: createPlainTextBundle("plain", { en: "Hello", de: "Hallo" }),
		fallbackMap: { en: undefined, de: "en" },
		settings: { baseLocale: "en", locales: ["en", "de"] } as ProjectSettings,
		messageReferenceExpression: (locale) => `${locale}_plain`,
	});
	expect(result.bundle.code).toContain("return de_plain(inputs)");
	expect(result.bundle.code).not.toContain(
		'return /** @type {LocalizedString} */ ("Hallo")'
	);
});

test("Vite dispatch markers preserve the generated public function and exclude static/middleware modes", async () => {
	const settings = {
		baseLocale: "es",
		locales: ["es", "en", "de", "fr", "it", "pt", "ru", "ja"],
	} as ProjectSettings;
	const args = {
		bundle: createPlainTextBundle("welcome", {
			es: "Hola",
			en: "Hello",
			de: "Hallo",
		}),
		fallbackMap: {
			es: undefined,
			en: "es",
			de: "es",
			fr: "es",
			it: "es",
			pt: "es",
			ru: "es",
			ja: "es",
		},
		messageReferenceExpression: (locale: string) => `${locale}_welcome`,
		settings,
		inlineMessages: true,
	};
	const standard = compileBundle(args).bundle.code;
	const marked = compileBundleForVite(args).bundle.code;
	expect(standard).not.toContain("__paraglide_dispatch_locale_");
	expect(marked).toContain("const __paraglide_dispatch_locale_l2_65_73 =");
	expect(marked).toContain("export const welcome");
	const setup =
		"const experimentalStaticLocale=undefined; const getLocale=()=> 'es';";
	const load = (code: string) =>
		import(
			`data:text/javascript;base64,${Buffer.from(setup + code).toString("base64")}`
		);
	const before = await load(standard),
		after = await load(marked);
	for (const locale of [undefined, "en", "de", "es", "unknown"])
		expect(after.welcome({}, { locale })).toBe(before.welcome({}, { locale }));
	for (const mode of [
		{ experimentalMiddlewareLocaleSplitting: true },
		{ experimentalStaticLocale: "'es'" },
	])
		expect(
			compileBundleForVite({ ...args, ...mode }).bundle.code
		).not.toContain("__paraglide_dispatch_locale_");
});
