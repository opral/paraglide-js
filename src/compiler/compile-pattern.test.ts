import { test, expect } from "vitest";
import { compilePattern } from "./compile-pattern.js";
import type { Pattern } from "@inlang/sdk";

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
