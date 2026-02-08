import { test, expect } from "vitest";
import { compileBundle } from "./compile-bundle.js";
import type { BundleNested, ProjectSettings } from "@inlang/sdk";
import { toSafeModuleId } from "./safe-module-id.js";

test("compiles to jsdoc", async () => {
	const mockBundle: BundleNested = {
		id: "blue_moon_bottle",
		declarations: [{ type: "input-variable", name: "age" }],
		messages: [
			{
				id: "message-id",
				bundleId: "blue_moon_bottle",
				locale: "en",
				selectors: [],
				variants: [
					{
						id: "1",
						messageId: "message-id",
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
		* This function has been compiled by [Paraglide JS](https://inlang.com/m/gerre34r).
		*
		* - Changing this function will be over-written by the next build.
		*
		* - If you want to change the translations, you can either edit the source files e.g. \`en.json\`, or
		* use another inlang app like [Fink](https://inlang.com/m/tdozzpar) or the [VSCode extension Sherlock](https://inlang.com/m/r7kp499g).
		* 
		* @param {{ age: NonNullable<unknown> }} inputs
		* @param {{ locale?: "en" | "en-US" }} options
		* @returns {LocalizedString}
		*/
		/* @__NO_SIDE_EFFECTS__ */
		export const blue_moon_bottle = /** @type {((inputs: { age: NonNullable<unknown> }, options?: { locale?: "en" | "en-US" }) => LocalizedString) & import('../runtime.js').MessageMetadata<{ age: NonNullable<unknown> }, { locale?: "en" | "en-US" }, {}>} */ ((inputs, options = {}) => {
			if (experimentalMiddlewareLocaleSplitting && isServer === false) {
				return /** @type {any} */ (globalThis).__paraglide_ssr.blue_moon_bottle(inputs) 
			}
			const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
			trackMessageCall("blue_moon_bottle", locale)
			if (locale === "en") return en.blue_moon_bottle(inputs)
			return en_us2.blue_moon_bottle(inputs)
		});"
	`
	);
});

test("compiles to jsdoc with missing translation", async () => {
	const mockBundle: BundleNested = {
		id: "blue_moon_bottle",
		declarations: [{ type: "input-variable", name: "age" }],
		messages: [
			{
				id: "message-id",
				bundleId: "blue_moon_bottle",
				locale: "en",
				selectors: [],
				variants: [
					{
						id: "1",
						messageId: "message-id",
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
		* This function has been compiled by [Paraglide JS](https://inlang.com/m/gerre34r).
		*
		* - Changing this function will be over-written by the next build.
		*
		* - If you want to change the translations, you can either edit the source files e.g. \`en.json\`, or
		* use another inlang app like [Fink](https://inlang.com/m/tdozzpar) or the [VSCode extension Sherlock](https://inlang.com/m/r7kp499g).
		* 
		* @param {{ age: NonNullable<unknown> }} inputs
		* @param {{ locale?: "en" | "en-US" }} options
		* @returns {LocalizedString}
		*/
		/* @__NO_SIDE_EFFECTS__ */
		export const blue_moon_bottle = /** @type {((inputs: { age: NonNullable<unknown> }, options?: { locale?: "en" | "en-US" }) => LocalizedString) & import('../runtime.js').MessageMetadata<{ age: NonNullable<unknown> }, { locale?: "en" | "en-US" }, {}>} */ ((inputs, options = {}) => {
			if (experimentalMiddlewareLocaleSplitting && isServer === false) {
				return /** @type {any} */ (globalThis).__paraglide_ssr.blue_moon_bottle(inputs) 
			}
			const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
			trackMessageCall("blue_moon_bottle", locale)
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
				bundleId: "$p@44🍌",
				locale: "en",
				selectors: [],
				variants: [
					{
						id: "1",
						messageId: "message-id",
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
		fallbackMap: {},
		bundle: mockBundle,
		messageReferenceExpression: (locale) =>
			`${toSafeModuleId(locale)}.blue_moon_bottle`,
	});

	expect(result.bundle.code).includes(
		`export { ${toSafeModuleId("$p@44🍌")} as "$p@44🍌" }`
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
				bundleId: "date_last_days",
				locale: "en",
				selectors: [],
				variants: [
					{
						id: "1",
						messageId: "date_last_days",
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
		fallbackMap: {
			en: "en",
		},
		bundle: mockBundle,
		messageReferenceExpression: (locale) =>
			`${toSafeModuleId(locale)}.date_last_days`,
	});

	// The JSDoc should not have duplicate parameters
	expect(result.bundle.code).toContain(
		"@param {{ days: NonNullable<unknown> }} inputs"
	);
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
				bundleId: "notice",
				locale: "en",
				selectors: [],
				variants: [
					{
						id: "1",
						messageId: "notice-id",
						matches: [],
						pattern: [
							{ type: "markup-start", name: "strong", options: [], attributes: [] },
							{
								type: "expression",
								arg: { type: "variable-reference", name: "count" },
							},
							{ type: "text", value: " items" },
							{ type: "markup-end", name: "strong", options: [], attributes: [] },
						],
					},
				],
			},
		],
	};

	const result = compileBundle({
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
		'MessageMetadata<{ count: NonNullable<unknown> }, { locale?: "en" }, { strong: { options: {}; attributes: {}; children: true } }>'
	);
});
