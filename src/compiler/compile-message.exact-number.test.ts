import { describe, expect, test } from "vitest";
import type {
	BundleNested,
	Declaration,
	Match,
	Message,
	Pattern,
	ProjectSettings,
	Variant,
} from "@inlang/sdk";
import { compileMessage } from "./compile-message.js";
import { compileBundle } from "./compile-bundle.js";
import { createRegistry } from "./registry.js";
import { toSafeModuleId } from "./safe-module-id.js";

/**
 * Compiles a message and imports it together with an inlined registry so the
 * generated code can be executed.
 */
async function compileAndImport(args: {
	declarations: Declaration[];
	selectors: string[];
	locale: string;
	variants: Array<{ matches: Match[]; pattern: Pattern }>;
}) {
	const message: Message = {
		id: "message-id",
		bundleId: "exact_message",
		locale: args.locale,
		selectors: args.selectors.map((name) => ({
			type: "variable-reference",
			name,
		})),
	};
	const variants: Variant[] = args.variants.map((variant, index) => ({
		id: String(index),
		messageId: message.id,
		...variant,
	}));
	const compiled = compileMessage(args.declarations, message, variants);
	const source =
		createRegistry() +
		"\nexport const exact_message = " +
		compiled.code.replaceAll("registry.", "");
	const module = await import(
		"data:text/javascript;base64," + Buffer.from(source).toString("base64")
	);
	return {
		code: compiled.code,
		message: module.exact_message as (
			inputs: Record<string, unknown>
		) => string,
	};
}

const literal = (key: string, value: string): Match => ({
	type: "literal-match",
	key,
	value,
});
const catchall = (key: string): Match => ({ type: "catchall-match", key });
const text = (value: string): Pattern => [{ type: "text", value }];
const withCount = (before: string, after = ""): Pattern => [
	{ type: "text", value: before },
	{ type: "expression", arg: { type: "variable-reference", name: "count" } },
	{ type: "text", value: after },
];

/**
 * The shape inlang's ICU MessageFormat 1 plugin imports
 * `{count, plural, =0 {…} one {…} other {…}}` as, and the shape editors create
 * when a user adds an exact number to a plural message.
 */
const icuDeclarations = (): Declaration[] => [
	{ type: "input-variable", name: "count" },
	{
		type: "local-variable",
		name: "countPluralExact",
		value: {
			type: "expression",
			arg: { type: "variable-reference", name: "count" },
		},
	},
	{
		type: "local-variable",
		name: "countPlural",
		value: {
			type: "expression",
			arg: { type: "variable-reference", name: "count" },
			annotation: { type: "function-reference", name: "plural", options: [] },
		},
	},
];
const icuSelectors = ["countPluralExact", "countPlural"];

/** ICU `=N {…}` */
const exact = (value: string, pattern: Pattern) => ({
	matches: [literal("countPluralExact", value), catchall("countPlural")],
	pattern,
});
/** ICU `one {…}`, `few {…}`, ... */
const category = (value: string, pattern: Pattern) => ({
	matches: [catchall("countPluralExact"), literal("countPlural", value)],
	pattern,
});
/** ICU `other {…}` */
const other = (pattern: Pattern) => ({
	matches: [catchall("countPluralExact"), catchall("countPlural")],
	pattern,
});

const render = (
	message: (inputs: Record<string, unknown>) => string,
	counts: unknown[]
) =>
	Object.fromEntries(
		counts.map((count) => [String(JSON.stringify(count)), message({ count })])
	);

const COUNTS = [0, 1, 2, 5, 21, "0"];

describe("exact number matches on un-annotated local aliases (ICU =N)", () => {
	test("en: =0, one, other", async () => {
		const { message, code } = await compileAndImport({
			locale: "en",
			declarations: icuDeclarations(),
			selectors: icuSelectors,
			variants: [
				exact("0", text("No items")),
				category("one", withCount("", " item")),
				other(withCount("", " items")),
			],
		});

		expect(code).toContain(
			'(countPluralExact === 0 || countPluralExact === "0")'
		);
		expect(render(message, COUNTS)).toEqual({
			"0": "No items",
			"1": "1 item",
			"2": "2 items",
			"5": "5 items",
			"21": "21 items",
			'"0"': "No items",
		});
	});

	test("en: =1 wins over one and matches the string '1'", async () => {
		const { message } = await compileAndImport({
			locale: "en",
			declarations: icuDeclarations(),
			selectors: icuSelectors,
			variants: [
				exact("0", text("No items")),
				exact("1", text("Exactly one item")),
				category("one", withCount("", " item")),
				other(withCount("", " items")),
			],
		});

		expect(render(message, [...COUNTS, "1"])).toEqual({
			"0": "No items",
			"1": "Exactly one item",
			"2": "2 items",
			"5": "5 items",
			"21": "21 items",
			'"0"': "No items",
			'"1"': "Exactly one item",
		});
	});

	test("fr: =0 wins over one, which covers 0 in French", async () => {
		const { message } = await compileAndImport({
			locale: "fr",
			declarations: icuDeclarations(),
			selectors: icuSelectors,
			variants: [
				exact("0", text("Aucun élément")),
				category("one", withCount("", " élément")),
				other(withCount("", " éléments")),
			],
		});

		expect(render(message, COUNTS)).toEqual({
			"0": "Aucun élément",
			"1": "1 élément",
			"2": "2 éléments",
			"5": "5 éléments",
			"21": "21 éléments",
			'"0"': "Aucun élément",
		});
	});

	test("fr: variant preference follows selector order, not storage order", async () => {
		// editors append the exact variant after the existing plural variants
		const { message } = await compileAndImport({
			locale: "fr",
			declarations: icuDeclarations(),
			selectors: icuSelectors,
			variants: [
				other(withCount("", " éléments")),
				category("one", withCount("", " élément")),
				exact("0", text("Aucun élément")),
			],
		});

		expect(render(message, COUNTS)).toEqual({
			"0": "Aucun élément",
			"1": "1 élément",
			"2": "2 éléments",
			"5": "5 éléments",
			"21": "21 éléments",
			'"0"': "Aucun élément",
		});
	});

	test("ru: =0 and =1 next to one/few/many/other", async () => {
		const { message } = await compileAndImport({
			locale: "ru",
			declarations: icuDeclarations(),
			selectors: icuSelectors,
			variants: [
				exact("0", text("Нет файлов")),
				exact("1", text("Ровно один файл")),
				category("one", withCount("", " файл")),
				category("few", withCount("", " файла")),
				category("many", withCount("", " файлов")),
				other(withCount("", " файла (other)")),
			],
		});

		expect(render(message, COUNTS)).toEqual({
			"0": "Нет файлов",
			"1": "Ровно один файл",
			"2": "2 файла",
			"5": "5 файлов",
			"21": "21 файл",
			'"0"': "Нет файлов",
		});
	});

	test("ja: =0 and =1 in a locale with only the other category", async () => {
		const { message } = await compileAndImport({
			locale: "ja",
			declarations: icuDeclarations(),
			selectors: icuSelectors,
			variants: [
				exact("0", text("アイテムなし")),
				exact("1", text("アイテム1つだけ")),
				other(withCount("アイテム", "個")),
			],
		});

		expect(render(message, COUNTS)).toEqual({
			"0": "アイテムなし",
			"1": "アイテム1つだけ",
			"2": "アイテム2個",
			"5": "アイテム5個",
			"21": "アイテム21個",
			'"0"': "アイテムなし",
		});
	});

	test("exact numbers nested inside a select", async () => {
		// {gender, select, female {{count, plural, =0 {…} one {…} other {…}}} other {…}}
		const declarations: Declaration[] = [
			{ type: "input-variable", name: "gender" },
			...icuDeclarations(),
		];
		const nested = (
			gender: Match,
			variant: { matches: Match[]; pattern: Pattern }
		) => ({ ...variant, matches: [gender, ...variant.matches] });
		const female = literal("gender", "female");
		const anyGender = catchall("gender");

		for (const locale of ["en", "fr"]) {
			const { message } = await compileAndImport({
				locale,
				declarations,
				selectors: ["gender", ...icuSelectors],
				variants: [
					nested(female, exact("0", text("She has none"))),
					nested(female, category("one", withCount("She has ", " (one)"))),
					nested(female, other(withCount("She has ", " (other)"))),
					nested(anyGender, exact("0", text("They have none"))),
					nested(anyGender, category("one", withCount("They have ", " (one)"))),
					nested(anyGender, other(withCount("They have ", " (other)"))),
				],
			});

			const results = (gender: string) =>
				COUNTS.map((count) => message({ gender, count }));
			// =0 wins in both locales, also where French `one` covers 0
			expect(results("female")).toEqual([
				"She has none",
				"She has 1 (one)",
				"She has 2 (other)",
				"She has 5 (other)",
				"She has 21 (other)",
				"She has none",
			]);
			expect(results("male")).toEqual([
				"They have none",
				"They have 1 (one)",
				"They have 2 (other)",
				"They have 5 (other)",
				"They have 21 (other)",
				"They have none",
			]);
		}
	});

	test("resolves chains of un-annotated aliases", async () => {
		const { message, code } = await compileAndImport({
			locale: "fr",
			declarations: [
				{ type: "input-variable", name: "count" },
				{
					type: "local-variable",
					name: "countAlias",
					value: {
						type: "expression",
						arg: { type: "variable-reference", name: "count" },
					},
				},
				{
					type: "local-variable",
					name: "countAliasAlias",
					value: {
						type: "expression",
						arg: { type: "variable-reference", name: "countAlias" },
					},
				},
				{
					type: "local-variable",
					name: "countPlural",
					value: {
						type: "expression",
						arg: { type: "variable-reference", name: "count" },
						annotation: {
							type: "function-reference",
							name: "plural",
							options: [],
						},
					},
				},
			],
			selectors: ["countAliasAlias", "countPlural"],
			variants: [
				{
					matches: [catchall("countAliasAlias"), literal("countPlural", "one")],
					pattern: text("one"),
				},
				{
					matches: [literal("countAliasAlias", "0"), catchall("countPlural")],
					pattern: text("zero"),
				},
				{
					matches: [catchall("countAliasAlias"), catchall("countPlural")],
					pattern: text("other"),
				},
			],
		});

		expect(code).toContain(
			'(countAliasAlias === 0 || countAliasAlias === "0")'
		);
		expect(COUNTS.map((count) => message({ count }))).toEqual([
			"zero",
			"one",
			"other",
			"other",
			"other",
			"zero",
		]);
	});

	test("annotated locals and literal locals keep string matching", async () => {
		const { code } = await compileAndImport({
			locale: "en",
			declarations: [
				{ type: "input-variable", name: "count" },
				{
					type: "local-variable",
					name: "formatted",
					value: {
						type: "expression",
						arg: { type: "variable-reference", name: "count" },
						annotation: {
							type: "function-reference",
							name: "number",
							options: [],
						},
					},
				},
				{
					// aliases the formatted string, not the input
					type: "local-variable",
					name: "formattedAlias",
					value: {
						type: "expression",
						arg: { type: "variable-reference", name: "formatted" },
					},
				},
				{
					type: "local-variable",
					name: "constant",
					value: {
						type: "expression",
						arg: { type: "literal", value: "0" },
					},
				},
			],
			selectors: ["formatted", "formattedAlias", "constant"],
			variants: [
				{ matches: [literal("formatted", "0")], pattern: text("a") },
				{ matches: [literal("formattedAlias", "0")], pattern: text("b") },
				{ matches: [literal("constant", "0")], pattern: text("c") },
				{ matches: [], pattern: text("d") },
			],
		});

		expect(code).toContain('if (formatted === "0")');
		expect(code).toContain('if (formattedAlias === "0")');
		expect(code).toContain('if (constant === "0")');
	});
});

describe("exact number matches on the input itself (i18next _zero import)", () => {
	// i18next `key_zero`, `key_one`, `key_other` import as selectors
	// `count` (exact 0) and `countPlural`. `_zero` also becomes the Intl `zero`
	// category variant. Variants are listed in import order.
	const declarations = (): Declaration[] => [
		{ type: "input-variable", name: "count" },
		{
			type: "local-variable",
			name: "countPlural",
			value: {
				type: "expression",
				arg: { type: "variable-reference", name: "count" },
				annotation: { type: "function-reference", name: "plural", options: [] },
			},
		},
	];
	const variants = (zero: string, one: Pattern, others: Pattern) => [
		{
			matches: [catchall("count"), literal("countPlural", "one")],
			pattern: one,
		},
		{
			matches: [catchall("count"), literal("countPlural", "other")],
			pattern: others,
		},
		{
			matches: [literal("count", "0"), catchall("countPlural")],
			pattern: text(zero),
		},
		{
			matches: [catchall("count"), literal("countPlural", "zero")],
			pattern: text(zero),
		},
	];

	test("en", async () => {
		const { message } = await compileAndImport({
			locale: "en",
			declarations: declarations(),
			selectors: ["count", "countPlural"],
			variants: variants(
				"No items",
				withCount("", " item"),
				withCount("", " items")
			),
		});

		expect(render(message, COUNTS)).toEqual({
			"0": "No items",
			"1": "1 item",
			"2": "2 items",
			"5": "5 items",
			"21": "21 items",
			'"0"': "No items",
		});
	});

	test("fr: exact 0 wins over one", async () => {
		const { message } = await compileAndImport({
			locale: "fr",
			declarations: declarations(),
			selectors: ["count", "countPlural"],
			variants: variants(
				"Aucun élément",
				withCount("", " élément"),
				withCount("", " éléments")
			),
		});

		expect(render(message, COUNTS)).toEqual({
			"0": "Aucun élément",
			"1": "1 élément",
			"2": "2 éléments",
			"5": "5 éléments",
			"21": "21 éléments",
			'"0"': "Aucun élément",
		});
	});
});

test("alias literal matches widen an input type narrowed by direct matches", () => {
	const bundle: BundleNested = {
		id: "status_message",
		declarations: [
			{ type: "input-variable", name: "status" },
			{
				type: "local-variable",
				name: "statusExact",
				value: {
					type: "expression",
					arg: { type: "variable-reference", name: "status" },
				},
			},
		],
		messages: [
			{
				id: "en-id",
				bundleId: "status_message",
				locale: "en",
				selectors: [{ type: "variable-reference", name: "status" }],
				variants: [
					{
						id: "1",
						messageId: "en-id",
						matches: [literal("status", "active")],
						pattern: text("Active"),
					},
				],
			},
			{
				id: "de-id",
				bundleId: "status_message",
				locale: "de",
				selectors: [{ type: "variable-reference", name: "statusExact" }],
				variants: [
					{
						id: "2",
						messageId: "de-id",
						matches: [literal("statusExact", "0")],
						pattern: text("Null"),
					},
				],
			},
		],
	};

	const result = compileBundle({
		fallbackMap: { en: "en", de: "de" },
		bundle,
		messageReferenceExpression: (locale) =>
			`${toSafeModuleId(locale)}.status_message`,
		settings: { locales: ["en", "de"] } as ProjectSettings,
	});

	expect(result.matchTypes.get("status")?.literals).toEqual(
		new Set(["active", "0"])
	);
});
