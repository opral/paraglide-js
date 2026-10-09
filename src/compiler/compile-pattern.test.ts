import { describe, test, expect } from "vitest";
import { compilePattern } from "./compile-pattern.js";
import type { Pattern } from "@inlang/sdk";
import { createRegistry } from "./registry.js";

test("should compile a text only pattern", () => {
	const pattern: Pattern = [{ type: "text", value: "Hello" }];
	const { code } = compilePattern({ pattern, declarations: [] });
	expect(code).toBe("`Hello`");
});

test("should compile a pattern with multiple VariableReference's", () => {
	const pattern: Pattern = [
		{ type: "text", value: "Hello " },
		{
			type: "expression",
			arg: {
				type: "variable-reference",
				name: "name",
			},
		},
		{ type: "text", value: "! You have " },
		{ type: "expression", arg: { type: "variable-reference", name: "count" } },
		{ type: "text", value: " messages." },
	];

	const { code } = compilePattern({
		pattern,
		declarations: [
			{ type: "input-variable", name: "name" },
			{ type: "input-variable", name: "count" },
		],
	});

	expect(code).toBe("`Hello ${i?.name}! You have ${i?.count} messages.`");
});

test("uses bracket notation for input variables with non-identifier names", () => {
	const pattern: Pattern = [
		{ type: "text", value: "Half " },
		{
			type: "expression",
			arg: {
				type: "variable-reference",
				name: "half!",
			},
		},
	];

	const { code } = compilePattern({
		pattern,
		declarations: [{ type: "input-variable", name: "half!" }],
	});

	expect(code).toBe('`Half ${i?.["half!"]}`');
});

test("should escape backticks", () => {
	const pattern: Pattern = [{ type: "text", value: "`Hello world`" }];
	const { code } = compilePattern({ pattern, declarations: [] });
	expect(code).toBe("`\\`Hello world\\``");
});

test("should escape backslashes", () => {
	const pattern: Pattern = [{ type: "text", value: "\\Hello world\\" }];
	const { code } = compilePattern({ pattern, declarations: [] });

	expect(code).toBe("`\\\\Hello world\\\\`");
});

test("should escape escaped backticks", () => {
	const pattern: Pattern = [{ type: "text", value: "\\`Hello world\\`" }];
	const { code } = compilePattern({ pattern, declarations: [] });

	expect(code).toBe("`\\\\\\`Hello world\\\\\\``");
});

test("should escape variable interpolation ( ${} )", () => {
	const pattern: Pattern = [{ type: "text", value: "${name" }];
	const { code } = compilePattern({ pattern, declarations: [] });

	expect(code).toBe("`\\${name`");
});

test("it can reference local variables", () => {
	const { code } = compilePattern({
		pattern: [
			{ type: "text", value: "Hello " },
			{
				type: "expression",
				arg: {
					type: "variable-reference",
					name: "name",
				},
			},
		],
		declarations: [
			{
				type: "local-variable",
				name: "name",
				value: {
					type: "expression",
					arg: { type: "literal", value: "Peter" },
				},
			},
		],
	});

	expect(code).toBe("`Hello ${name}`");
});

test("plain string mode strips markup wrappers", () => {
	const pattern: Pattern = [
		{ type: "text", value: "Hello " },
		{ type: "markup-start", name: "b" },
		{ type: "expression", arg: { type: "variable-reference", name: "name" } },
		{ type: "markup-end", name: "b" },
		{ type: "text", value: "!" },
	];

	const { code } = compilePattern({
		pattern,
		declarations: [{ type: "input-variable", name: "name" }],
	});

	expect(code).toBe("`Hello ${i?.name}!`");
});

test("compiles a pattern expression annotation to a registry call", () => {
	// https://github.com/opral/paraglide-js/issues/694
	const pattern: Pattern = [
		{
			type: "expression",
			arg: { type: "variable-reference", name: "count" },
			annotation: { type: "function-reference", name: "number", options: [] },
		},
		{ type: "text", value: " views" },
	];

	const { code } = compilePattern({
		pattern,
		declarations: [{ type: "input-variable", name: "count" }],
		locale: "en",
	});

	expect(code).toBe('`${registry.number("en", i?.count, {})} views`');
});

test("compiles pattern expression annotation options like local variable annotations", () => {
	const pattern: Pattern = [
		{
			type: "expression",
			arg: { type: "variable-reference", name: "price" },
			annotation: {
				type: "function-reference",
				name: "number",
				options: [
					{
						name: "minimumFractionDigits",
						value: { type: "literal", value: "2" },
					},
					{ name: "style", value: { type: "literal", value: "percent" } },
				],
			},
		},
	];

	const { code } = compilePattern({
		pattern,
		declarations: [{ type: "input-variable", name: "price" }],
		locale: "de",
	});

	expect(code).toBe(
		'`${registry.number("de", i?.price, { minimumFractionDigits: 2, style: "percent" })}`'
	);
});

test("compiles pattern annotation options that reference local variables", () => {
	const pattern: Pattern = [
		{
			type: "expression",
			arg: { type: "variable-reference", name: "price" },
			annotation: {
				type: "function-reference",
				name: "number",
				options: [
					{
						name: "minimumFractionDigits",
						value: { type: "variable-reference", name: "digits" },
					},
				],
			},
		},
	];

	const { code } = compilePattern({
		pattern,
		declarations: [
			{ type: "input-variable", name: "price" },
			{
				type: "local-variable",
				name: "digits",
				value: { type: "expression", arg: { type: "literal", value: "2" } },
			},
		],
		locale: "en",
	});

	expect(code).toBe(
		'`${registry.number("en", i?.price, { minimumFractionDigits: digits })}`'
	);
});

test("parts mode compiles pattern expression annotations to registry calls", () => {
	const pattern: Pattern = [
		{
			type: "expression",
			arg: { type: "variable-reference", name: "count" },
			annotation: { type: "function-reference", name: "number", options: [] },
		},
		{ type: "text", value: " views" },
	];

	const { code } = compilePattern({
		mode: "parts",
		pattern,
		declarations: [{ type: "input-variable", name: "count" }],
		locale: "en",
	});

	expect(code).toBe(
		'[{ type: "text", value: String(registry.number("en", i?.count, {})) }, { type: "text", value: " views" }]'
	);
});

test("falls back to plain interpolation for unknown formatters", () => {
	const pattern: Pattern = [
		{
			type: "expression",
			arg: { type: "variable-reference", name: "name" },
			annotation: {
				type: "function-reference",
				name: "uppercase",
				options: [],
			},
		},
	];

	const { code } = compilePattern({
		pattern,
		declarations: [{ type: "input-variable", name: "name" }],
		locale: "en",
	});

	expect(code).toBe("`${i?.name}`");
});

test("throws when a pattern annotation is compiled without a locale", () => {
	const pattern: Pattern = [
		{
			type: "expression",
			arg: { type: "variable-reference", name: "count" },
			annotation: { type: "function-reference", name: "number", options: [] },
		},
	];

	expect(() =>
		compilePattern({
			pattern,
			declarations: [{ type: "input-variable", name: "count" }],
		})
	).toThrow('requires a locale to compile the formatter "number"');
});

test("validates relativetime options on pattern annotations", () => {
	const pattern: Pattern = [
		{
			type: "expression",
			arg: { type: "variable-reference", name: "days" },
			annotation: {
				type: "function-reference",
				name: "relativetime",
				options: [],
			},
		},
	];

	expect(() =>
		compilePattern({
			pattern,
			declarations: [{ type: "input-variable", name: "days" }],
			locale: "en",
		})
	).toThrow('The "relativetime" formatter requires a "unit" option.');
});

test("parts mode compiles text, markup, options and attributes", () => {
	const pattern: Pattern = [
		{ type: "text", value: "Read " },
		{
			type: "markup-start",
			name: "link",
			options: [
				{ name: "to", value: { type: "literal", value: "/docs" } },
				{
					name: "rel",
					value: { type: "variable-reference", name: "relationship" },
				},
			],
			attributes: [
				{ name: "track", value: true },
				{ name: "variant", value: { type: "literal", value: "hero" } },
			],
		},
		{ type: "text", value: "docs" },
		{
			type: "markup-end",
			name: "link",
			options: [{ name: "to", value: { type: "literal", value: "/docs" } }],
			attributes: [{ name: "track", value: true }],
		},
		{
			type: "markup-standalone",
			name: "icon",
			options: [{ name: "name", value: { type: "literal", value: "arrow" } }],
			attributes: [{ name: "filled", value: true }],
		},
	];

	const { code } = compilePattern({
		mode: "parts",
		pattern,
		declarations: [{ type: "input-variable", name: "relationship" }],
	});

	expect(code).toBe(
		'[{ type: "text", value: "Read " }, { type: "markup-start", name: "link", options: { "to": "/docs", "rel": i?.relationship }, attributes: { "track": true, "variant": "hero" } }, { type: "text", value: "docs" }, { type: "markup-end", name: "link", options: { "to": "/docs" }, attributes: { "track": true } }, { type: "markup-standalone", name: "icon", options: { "name": "arrow" }, attributes: { "filled": true } }]'
	);
});

describe("ICU MessageFormat 1 styles, as imported by the ICU1 plugin", () => {
	const date = new Date(Date.UTC(2026, 9, 9, 14, 30));

	/** Compiles `{arg :name style=style}` and runs it with the registry. */
	const run = async (
		name: string,
		style: string | undefined,
		input: unknown
	) => {
		const { code } = compilePattern({
			pattern: [
				{
					type: "expression",
					arg: { type: "variable-reference", name: "value" },
					annotation: {
						type: "function-reference",
						name,
						options:
							style === undefined
								? []
								: [{ name: "style", value: { type: "literal", value: style } }],
					},
				},
			],
			declarations: [{ type: "input-variable", name: "value" }],
			locale: "en",
		});
		const { format } = await import(
			"data:text/javascript;base64," +
				btoa(
					createRegistry() +
						`export const format = (i) => ${code.replaceAll("registry.", "")};`
				)
		);
		return { code, output: format({ value: input }) as string };
	};

	test.each([
		["short", { dateStyle: "short" }],
		["medium", { dateStyle: "medium" }],
		["long", { dateStyle: "long" }],
		["full", { dateStyle: "full" }],
		// ICU's and MessageFormat 2's default date style
		[undefined, { dateStyle: "medium" }],
	] as const)("formats {d, date, %s} like Intl", async (style, options) => {
		const { code, output } = await run("date", style, date);
		expect(code).toContain("registry.datetime(");
		expect(output).toBe(new Intl.DateTimeFormat("en", options).format(date));
	});

	test.each([
		["short", { timeStyle: "short" }],
		["medium", { timeStyle: "medium" }],
		["long", { timeStyle: "long" }],
		["full", { timeStyle: "full" }],
		// ICU's default time style
		[undefined, { timeStyle: "medium" }],
	] as const)("formats {d, time, %s} like Intl", async (style, options) => {
		const { output } = await run("time", style, date);
		expect(output).toBe(new Intl.DateTimeFormat("en", options).format(date));
	});

	test("formats {n, number, integer} without fraction digits", async () => {
		const { code, output } = await run("number", "integer", 1234.5);
		expect(code).toContain("{ maximumFractionDigits: 0 }");
		expect(output).toBe("1,235");
	});

	test("keeps Intl number styles", async () => {
		expect((await run("number", "percent", 0.256)).output).toBe("26%");
	});

	test.each([
		// ICU number skeletons
		["number", "::currency/EUR", 1234.5, "1,234.5"],
		// "currency" needs a "currency" option
		["number", "currency", 1234.5, "1,234.5"],
		// ICU date skeletons format like {d, date}
		[
			"date",
			"::yyyyMMdd",
			date,
			new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(date),
		],
	] as const)(
		"ignores the unsupported style {%s, %s} instead of throwing",
		async (name, style, input, expected) => {
			const { code, output } = await run(name, style, input);
			expect(code).not.toContain(style);
			expect(output).toBe(expected);
		}
	);
});

describe("default date and time styles", () => {
	const date = new Date(Date.UTC(2026, 9, 9, 14, 30));

	/** Compiles `{$value :name option=value ...}` and runs it with the registry. */
	const run = async (name: string, options: Record<string, string> = {}) => {
		const { code } = compilePattern({
			pattern: [
				{
					type: "expression",
					arg: { type: "variable-reference", name: "value" },
					annotation: {
						type: "function-reference",
						name,
						options: Object.entries(options).map(([name, value]) => ({
							name,
							value: { type: "literal", value },
						})),
					},
				},
			],
			declarations: [{ type: "input-variable", name: "value" }],
			locale: "en",
		});
		const { format } = await import(
			"data:text/javascript;base64," +
				btoa(
					createRegistry() +
						`export const format = (i) => ${code.replaceAll("registry.", "")};`
				)
		);
		return { code, output: format({ value: date }) as string };
	};

	test("{$d :date} defaults to style=medium, like ICU and MessageFormat 2", async () => {
		const { code, output } = await run("date", { timeZone: "UTC" });
		expect(code).toContain('{ dateStyle: "medium", timeZone: "UTC" }');
		expect(output).toBe("Oct 9, 2026");
	});

	test("{$d :time} defaults to ICU's style=medium", async () => {
		const { code, output } = await run("time", { timeZone: "UTC" });
		expect(code).toContain('{ timeStyle: "medium", timeZone: "UTC" }');
		expect(output).toMatch(/^2:30:00\sPM$/);
	});

	test("{$d :datetime} defaults to dateStyle=medium timeStyle=short, like MessageFormat 2", async () => {
		expect((await run("datetime")).code).toContain(
			'{ dateStyle: "medium", timeStyle: "short" }'
		);
		const { output } = await run("datetime", { timeZone: "UTC" });
		expect(output).toMatch(/^Oct 9, 2026, 2:30\sPM$/);
	});

	test.each([
		["datetime", { year: "numeric", timeZone: "UTC" }, "2026"],
		["datetime", { dateStyle: "long", timeZone: "UTC" }, "October 9, 2026"],
		["date", { month: "long", timeZone: "UTC" }, "October"],
		// Intl throws for timeStyle together with hour
		["time", { hour: "numeric", hour12: "false", timeZone: "UTC" }, "14"],
	] as const)(
		"options that pick fields replace the default of %s %j",
		async (name, options, expected) => {
			const { code, output } = await run(name, options);
			// no default dateStyle=medium or timeStyle=medium/short is added
			expect(code).not.toMatch(/"medium"|"short"/);
			expect(output).toBe(expected);
		}
	);
});
