import { test, expect } from "vitest";
import { compileBundle, toBundleInputTypeAliasName } from "./compile-bundle.js";
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
	expect(result.messages.en?.code).toBeDefined();

	const enMessage = result.messages.en;
	const deMessage = result.messages.de;
	if (!enMessage || !deMessage) throw new Error("Expected compiled messages");
	const moduleSource = `
const getLocale = () => "en";
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

test("leaves markup messages on their message functions", () => {
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
});

type Pattern = BundleNested["messages"][number]["variants"][number]["pattern"];

function createBundle(
	id: string,
	declarations: BundleNested["declarations"],
	variantsByLocale: Record<
		string,
		Array<{
			matches?: BundleNested["messages"][number]["variants"][number]["matches"];
			pattern: Pattern;
		}>
	>,
	selectors: BundleNested["messages"][number]["selectors"] = []
): BundleNested {
	return {
		id,
		declarations,
		messages: Object.entries(variantsByLocale).map(([locale, variants]) => ({
			id: `${id}-${locale}`,
			bundle_id: id,
			locale,
			selectors,
			variants: variants.map((variant, index) => ({
				id: `${id}-${locale}-${index}`,
				message_id: `${id}-${locale}`,
				matches: variant.matches ?? [],
				pattern: variant.pattern,
			})),
		})),
	};
}

const variable = (name: string) => ({
	type: "expression" as const,
	arg: { type: "variable-reference" as const, name },
});

function createInputBundle(): BundleNested {
	return createBundle("welcome", [{ type: "input-variable", name: "name" }], {
		en: [{ pattern: [{ type: "text", value: "Hello " }, variable("name")] }],
		de: [{ pattern: [{ type: "text", value: "Hallo " }, variable("name")] }],
	});
}

/**
 * Imports a compiled bundle the way message-modules output assembles it: the
 * dispatcher plus the message functions of the locales it still references.
 */
async function importBundle(
	result: ReturnType<typeof compileBundle>,
	bundleId: string,
	prelude = ""
) {
	const messageFunctions = Object.entries(result.messages)
		.filter(([locale]) => !result.unreferencedMessageLocales?.includes(locale))
		.map(
			([locale, message]) =>
				`const ${locale}_${bundleId} = ${message.code.replace(/;\s*$/, "")};`
		);
	return import(
		"data:text/javascript;charset=utf-8," +
			encodeURIComponent(`
const getLocale = () => "en";
const experimentalStaticLocale = undefined;
${prelude}
const isDevelopment = true;
${messageFunctions.join("\n")}
${result.bundle.code}
`)
	);
}

test("inlines message bodies with inputs and keeps fallback targets as functions", async () => {
	const result = compileBundle({
		inlineMessages: true,
		bundle: createInputBundle(),
		// fr has no message and aliases de, so de stays a function fr can call.
		fallbackMap: { en: undefined, de: "en", fr: "de" },
		messageReferenceExpression: (locale) => `${locale}_welcome`,
		settings: {
			baseLocale: "en",
			locales: ["en", "de", "fr"],
		} as ProjectSettings,
	});

	expect(result.unreferencedMessageLocales).toEqual(["en"]);
	expect(result.bundle.code).not.toContain("en_welcome");
	expect(result.bundle.code).toContain("fr_welcome(");

	const module = await importBundle(
		result,
		"welcome",
		"const fr_welcome = (i) => de_welcome(i);"
	);
	expect(module.welcome({ name: "Ada" }, { locale: "en" })).toBe("Hello Ada");
	expect(module.welcome({ name: "Ada" }, { locale: "de" })).toBe("Hallo Ada");
	expect(module.welcome({ name: "Ada" }, { locale: "fr" })).toBe("Hallo Ada");
});

test("inlines multi-variant bodies in their own block scope", async () => {
	const variants = (none: string, some: string) => [
		{
			matches: [{ type: "literal-match" as const, key: "count", value: "0" }],
			pattern: [{ type: "text" as const, value: none }],
		},
		{
			matches: [{ type: "catchall-match" as const, key: "count" }],
			pattern: [{ type: "text" as const, value: some }],
		},
	];
	const result = compileBundle({
		inlineMessages: true,
		bundle: createBundle(
			"item_count",
			[{ type: "input-variable", name: "count" }],
			{
				en: variants("No items", "Some items"),
				de: variants("Keine Artikel", "Einige Artikel"),
			},
			[{ type: "variable-reference", name: "count" }]
		),
		fallbackMap: { en: undefined, de: "en" },
		messageReferenceExpression: (locale) => `${locale}_item_count`,
		settings: { baseLocale: "en", locales: ["en", "de"] } as ProjectSettings,
	});
	expect(result.unreferencedMessageLocales).toEqual(["en", "de"]);
	expect(result.bundle.code).not.toContain("_item_count");

	const module = await importBundle(result, "item_count");
	expect(module.item_count({ count: 0 }, { locale: "en" })).toBe("No items");
	expect(module.item_count({ count: 3 }, { locale: "en" })).toBe("Some items");
	expect(module.item_count({ count: "0" }, { locale: "de" })).toBe(
		"Keine Artikel"
	);
	expect(module.item_count({ count: 3 }, { locale: "de" })).toBe(
		"Einige Artikel"
	);
});

test("inlines locals that repeat across locales and shadow the dispatcher's locale and options", async () => {
	// Each locale declares `locale` and `options` again, next to the
	// dispatcher's own `locale` constant and `options` parameter.
	const pattern = (label: string): Pattern => [
		{ type: "text", value: label },
		variable("locale"),
		{ type: "text", value: " " },
		variable("options"),
	];
	const result = compileBundle({
		inlineMessages: true,
		bundle: createBundle(
			"weight",
			[
				{ type: "input-variable", name: "amount" },
				{
					type: "local-variable",
					name: "locale",
					value: variable("amount"),
				},
				{
					type: "local-variable",
					name: "options",
					value: {
						type: "expression",
						arg: { type: "literal", value: "kg" },
					},
				},
			],
			{
				en: [{ pattern: pattern("Weight: ") }],
				de: [{ pattern: pattern("Gewicht: ") }],
			}
		),
		fallbackMap: { en: undefined, de: "en" },
		messageReferenceExpression: (locale) => `${locale}_weight`,
		settings: { baseLocale: "en", locales: ["en", "de"] } as ProjectSettings,
	});
	expect(result.unreferencedMessageLocales).toEqual(["en", "de"]);
	expect(result.bundle.code).not.toContain("_weight");

	const module = await importBundle(result, "weight");
	expect(module.weight({ amount: 5 }, { locale: "en" })).toBe("Weight: 5 kg");
	expect(module.weight({ amount: 5 }, { locale: "de" })).toBe("Gewicht: 5 kg");
	expect(module.weight({ amount: 5 })).toBe("Weight: 5 kg");
});

test("returns the bundle id from an inlined body when no variant matches", async () => {
	const variants = (zero: string, one: string) => [
		{
			matches: [{ type: "literal-match" as const, key: "count", value: "0" }],
			pattern: [{ type: "text" as const, value: zero }],
		},
		{
			matches: [{ type: "literal-match" as const, key: "count", value: "1" }],
			pattern: [{ type: "text" as const, value: one }],
		},
	];
	const result = compileBundle({
		inlineMessages: true,
		bundle: createBundle(
			"bottles",
			[{ type: "input-variable", name: "count" }],
			{
				en: variants("No bottles", "One bottle"),
				de: variants("Keine Flaschen", "Eine Flasche"),
			},
			[{ type: "variable-reference", name: "count" }]
		),
		fallbackMap: { en: undefined, de: "en" },
		messageReferenceExpression: (locale) => `${locale}_bottles`,
		settings: { baseLocale: "en", locales: ["en", "de"] } as ProjectSettings,
	});
	expect(result.unreferencedMessageLocales).toEqual(["en", "de"]);
	expect(result.bundle.code).not.toContain("_bottles");

	const module = await importBundle(result, "bottles");
	expect(module.bottles({ count: 1 }, { locale: "de" })).toBe("Eine Flasche");
	expect(module.bottles({ count: 7 }, { locale: "en" })).toBe("bottles");
	expect(module.bottles({ count: 7 }, { locale: "de" })).toBe("bottles");
});

test("inlines inputs in message modules of a per-locale build", async () => {
	const result = compileBundle({
		inlineMessages: true,
		bundle: createInputBundle(),
		fallbackMap: { en: undefined, de: "en" },
		messageReferenceExpression: (locale) => `${locale}_welcome`,
		settings: { baseLocale: "en", locales: ["en", "de"] } as ProjectSettings,
		experimentalStaticLocale: perLocaleBuildStaticLocaleExpression,
	});

	expect(result.unreferencedMessageLocales).toEqual(["en", "de"]);
	expect(result.bundle.code).not.toContain("_welcome(");
	for (const [locale, expected] of [
		["en", "Hello Ada"],
		["de", "Hallo Ada"],
	]) {
		const module = await importBundle(
			result,
			"welcome",
			`const globalThis = { __PARAGLIDE_STATIC_LOCALE__: "${locale}" };`
		);
		expect(module.welcome({ name: "Ada" })).toBe(expected);
	}
});

test("inlines static text in per-locale message modules and preserves override warnings", async () => {
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

	expect(result.unreferencedMessageLocales).toEqual(["en", "de"]);
	expect(result.bundle.code).not.toContain("_greeting(");
	const module = await importBundle(
		result,
		"greeting",
		`
		const globalThis = { __PARAGLIDE_STATIC_LOCALE__: "de" };
		export let warnings = 0;
		const console = { warn: () => warnings++ };
	`
	);
	expect(module.greeting()).toBe("Hallo");
	expect(module.warnings).toBe(0);
	expect(module.greeting({}, { locale: "en" })).toBe("Hallo");
	expect(module.warnings).toBe(1);
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
		`if (isDevelopment && ${expression} !== undefined && options.locale !== undefined && options.locale !== ${expression}) console.warn(`
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
