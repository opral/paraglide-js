import { describe, expect, test, vi } from "vitest";
import type {
	Declaration,
	Expression,
	LocalVariable,
	Match,
	Message,
	Pattern,
	Variant,
} from "@inlang/sdk";
import { compileMessage } from "./compile-message.js";
import { createRegistry } from "./registry.js";
import { Logger } from "../services/logger/index.js";

/**
 * Compiles a message and imports it together with an inlined registry so the
 * generated code can be executed.
 */
async function compileAndImport(args: {
	declarations: Declaration[];
	selectors?: string[];
	locale?: string;
	variants: Array<{ matches?: Match[]; pattern: Pattern }>;
}) {
	const code = compile(args);
	const source =
		createRegistry() +
		"\nexport const locals_message = " +
		code.replaceAll("registry.", "");
	const module = await import(
		"data:text/javascript;base64," + Buffer.from(source).toString("base64")
	);
	return {
		code,
		message: module.locals_message as ((
			inputs?: Record<string, unknown>
		) => string) & {
			parts?: (inputs?: Record<string, unknown>) => unknown[];
		},
	};
}

function compile(args: {
	declarations: Declaration[];
	selectors?: string[];
	locale?: string;
	variants: Array<{ matches?: Match[]; pattern: Pattern }>;
}): string {
	const message: Message = {
		id: "message-id",
		bundleId: "locals_message",
		locale: args.locale ?? "en",
		selectors: (args.selectors ?? []).map((name) => ({
			type: "variable-reference",
			name,
		})),
	};
	const variants: Variant[] = args.variants.map((variant, index) => ({
		id: String(index),
		messageId: message.id,
		matches: variant.matches ?? [],
		pattern: variant.pattern,
	}));
	return compileMessage(args.declarations, message, variants).code;
}

const input = (name: string): Declaration => ({
	type: "input-variable",
	name,
});
const local = (
	name: string,
	arg: string,
	annotation?: Expression["annotation"]
): LocalVariable => ({
	type: "local-variable",
	name,
	value: {
		type: "expression",
		arg: { type: "variable-reference", name: arg },
		...(annotation ? { annotation } : {}),
	},
});
const plural = (): Expression["annotation"] => ({
	type: "function-reference",
	name: "plural",
	options: [],
});
const ref = (name: string): Pattern[number] => ({
	type: "expression",
	arg: { type: "variable-reference", name },
});
const literal = (key: string, value: string): Match => ({
	type: "literal-match",
	key,
	value,
});
const catchall = (key: string): Match => ({ type: "catchall-match", key });
const text = (value: string): Pattern[number] => ({ type: "text", value });

describe("emits only the locals a message reads", () => {
	test("a locale that does not read a bundle local does not declare it", async () => {
		const { code, message } = await compileAndImport({
			declarations: [input("status"), local("statusExact", "status")],
			selectors: ["status"],
			variants: [
				{ matches: [literal("status", "active")], pattern: [text("Active")] },
				{ matches: [catchall("status")], pattern: [text("Other")] },
			],
		});

		expect(code).not.toContain("statusExact");
		expect(message({ status: "active" })).toBe("Active");
		expect(message({ status: "inactive" })).toBe("Other");
	});

	test("locals read through selectors, patterns and other locals are declared", async () => {
		const { code, message } = await compileAndImport({
			declarations: [
				input("count"),
				input("name"),
				local("countValue", "count"),
				local("countPlural", "countValue", plural()),
				local("unusedPlural", "count", plural()),
				local("nameValue", "name"),
				local("unusedName", "name"),
			],
			selectors: ["countPlural"],
			variants: [
				{
					matches: [literal("countPlural", "one")],
					pattern: [text("One for "), ref("nameValue")],
				},
				{
					matches: [catchall("countPlural")],
					pattern: [text("Many for "), ref("nameValue")],
				},
			],
		});

		expect(code).toContain("const countValue = i?.count;");
		expect(code).toContain(
			'const countPlural = registry.plural("en", countValue, {});'
		);
		expect(code).toContain("const nameValue = i?.name;");
		expect(code).not.toContain("unusedPlural");
		expect(code).not.toContain("unusedName");
		expect(message({ count: 1, name: "Ada" })).toBe("One for Ada");
		expect(message({ count: 2, name: "Ada" })).toBe("Many for Ada");
	});

	test("locals read through annotation options are declared", async () => {
		const { code, message } = await compileAndImport({
			declarations: [
				input("amount"),
				input("digits"),
				input("unit"),
				input("value"),
				local("digitsValue", "digits"),
				local("unitValue", "unit"),
			],
			variants: [
				{
					pattern: [
						{
							type: "expression",
							arg: { type: "variable-reference", name: "amount" },
							annotation: {
								type: "function-reference",
								name: "number",
								options: [
									{
										name: "minimumFractionDigits",
										value: { type: "variable-reference", name: "digitsValue" },
									},
								],
							},
						},
						text(" / "),
						{
							type: "expression",
							arg: { type: "variable-reference", name: "value" },
							annotation: {
								type: "function-reference",
								name: "relativetime",
								// `unit=$unitValue` as a literal, as some importers emit it
								options: [
									{
										name: "unit",
										value: { type: "literal", value: "$unitValue" },
									},
								],
							},
						},
					],
				},
			],
		});

		expect(code).toContain("const digitsValue = i?.digits;");
		expect(code).toContain("const unitValue = i?.unit;");
		expect(message({ amount: 1, digits: 2, unit: "day", value: 1 })).toBe(
			"1.00 / in 1 day"
		);
	});

	test("options of unknown annotations are not emitted, so their locals are not declared", () => {
		const code = compile({
			declarations: [
				input("value"),
				input("style"),
				local("styleValue", "style"),
			],
			variants: [
				{
					pattern: [
						{
							type: "expression",
							arg: { type: "variable-reference", name: "value" },
							annotation: {
								type: "function-reference",
								name: "customFormatter",
								options: [
									{
										name: "style",
										value: { type: "variable-reference", name: "styleValue" },
									},
								],
							},
						},
					],
				},
			],
		});

		expect(code).not.toContain("styleValue");
	});

	test("a local read only by a markup option is declared in .parts() only", async () => {
		const { code, message } = await compileAndImport({
			declarations: [input("url"), local("href", "url")],
			variants: [
				{
					pattern: [
						{
							type: "markup-start",
							name: "link",
							options: [
								{
									name: "to",
									value: { type: "variable-reference", name: "href" },
								},
							],
						},
						text("Docs"),
						{ type: "markup-end", name: "link" },
					],
				},
			],
		});

		expect(code.match(/const href = i\?\.url;/g)).toHaveLength(1);
		// the string function reads no input
		expect(code).toContain("LocalizedString} */ (() => {");
		expect(message({ url: "/docs" })).toBe("Docs");
		expect(message.parts?.({ url: "/docs" })).toEqual([
			{
				type: "markup-start",
				name: "link",
				options: { to: "/docs" },
				attributes: {},
			},
			{ type: "text", value: "Docs" },
			{ type: "markup-end", name: "link", options: {}, attributes: {} },
		]);
	});

	test("a message that reads no input does not declare the input parameter", async () => {
		const { code, message } = await compileAndImport({
			declarations: [input("name"), local("nameValue", "name")],
			variants: [{ pattern: [text("Bonjour")] }],
		});

		expect(code).toContain("() => {");
		expect(code).not.toContain("nameValue");
		expect(message({ name: "Ada" })).toBe("Bonjour");
	});
});

describe("declaration order", () => {
	test("a local declared before the local it reads is emitted after it", async () => {
		const { code, message } = await compileAndImport({
			declarations: [
				input("count"),
				// reads countValue, which is declared below
				local("countPlural", "countValue", plural()),
				local("countValue", "countAlias"),
				local("countAlias", "count"),
			],
			selectors: ["countPlural"],
			variants: [
				{ matches: [literal("countPlural", "one")], pattern: [text("one")] },
				{ matches: [catchall("countPlural")], pattern: [text("other")] },
			],
		});

		const position = (name: string) => code.indexOf(`const ${name} =`);
		expect(position("countAlias")).toBeGreaterThan(-1);
		expect(position("countAlias")).toBeLessThan(position("countValue"));
		expect(position("countValue")).toBeLessThan(position("countPlural"));
		expect(message({ count: 1 })).toBe("one");
		expect(message({ count: 2 })).toBe("other");
	});

	test("locals in a valid order keep their declaration order", () => {
		const code = compile({
			declarations: [
				input("count"),
				local("b", "count"),
				local("a", "count"),
				local("c", "a"),
			],
			variants: [{ pattern: [ref("a"), ref("b"), ref("c")] }],
		});

		expect(code).toContain(
			"const b = i?.count;\n\tconst a = i?.count;\n\tconst c = a;"
		);
	});

	test("locals that reference each other in a cycle fail compilation", () => {
		expect(() =>
			compile({
				declarations: [input("count"), local("a", "b"), local("b", "a")],
				variants: [{ pattern: [ref("a")] }],
			})
		).toThrow(
			'The message "locals_message" (locale "en") has local variables that reference each other in a cycle: a -> b -> a.'
		);
	});

	test("a local that references itself fails compilation", () => {
		expect(() =>
			compile({
				declarations: [local("a", "a")],
				variants: [{ pattern: [ref("a")] }],
			})
		).toThrow("in a cycle: a -> a.");
	});

	test("a cycle among locals the message does not read is ignored", async () => {
		const { message } = await compileAndImport({
			declarations: [input("name"), local("a", "b"), local("b", "a")],
			variants: [{ pattern: [text("Hi "), ref("name")] }],
		});

		expect(message({ name: "Ada" })).toBe("Hi Ada");
	});
});

describe("undeclared variables", () => {
	test("an alias of an undeclared variable fails compilation", () => {
		// previously compiled to `const e = i?.count` without an `i` parameter,
		// which threw `ReferenceError: i is not defined` when called
		expect(() =>
			compile({
				declarations: [local("e", "count")],
				selectors: ["e"],
				variants: [
					{ matches: [literal("e", "0")], pattern: [text("zero")] },
					{ matches: [catchall("e")], pattern: [text("other")] },
				],
			})
		).toThrow(
			'The message "locals_message" (locale "en") references the variable "count" in the local variable "e", but "count" is not declared. Declare it as an input variable or a local variable.'
		);
	});

	test("an alias of an undeclared variable fails compilation when other inputs exist", () => {
		expect(() =>
			compile({
				declarations: [input("name"), local("e", "count")],
				variants: [{ pattern: [ref("name"), ref("e")] }],
			})
		).toThrow('references the variable "count" in the local variable "e"');
	});

	test("an undeclared variable in a pattern fails compilation with the bundle and locale", () => {
		expect(() =>
			compile({
				locale: "de",
				declarations: [input("name")],
				variants: [{ pattern: [ref("nmae")] }],
			})
		).toThrow(
			'The message "locals_message" (locale "de") references the variable "nmae", but "nmae" is not declared.'
		);
	});

	test("an undeclared variable in an annotation option fails compilation", () => {
		expect(() =>
			compile({
				declarations: [input("amount")],
				variants: [
					{
						pattern: [
							{
								type: "expression",
								arg: { type: "variable-reference", name: "amount" },
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
						],
					},
				],
			})
		).toThrow('references the variable "digits", but "digits" is not declared');
	});

	test("a local the message does not read may reference an undeclared variable", async () => {
		const { code, message } = await compileAndImport({
			declarations: [input("name"), local("e", "count")],
			variants: [{ pattern: [text("Hi "), ref("name")] }],
		});

		expect(code).not.toContain("count");
		expect(message({ name: "Ada" })).toBe("Hi Ada");
	});
});

describe("unknown annotations on locals", () => {
	test("interpolate the raw value like unknown pattern annotations", async () => {
		const warn = vi
			.spyOn(Logger.prototype, "warn")
			.mockImplementation(function (this: Logger) {
				return this;
			});
		try {
			const { code, message } = await compileAndImport({
				declarations: [
					input("amount"),
					input("style"),
					local("styleValue", "style"),
					local("formatted", "amount", {
						type: "function-reference",
						name: "customLocalFormatter",
						options: [
							{
								name: "style",
								value: { type: "variable-reference", name: "styleValue" },
							},
						],
					}),
				],
				variants: [{ pattern: [text("Total: "), ref("formatted")] }],
			});

			expect(code).toContain("const formatted = i?.amount;");
			expect(code).not.toContain("registry.");
			// the option of the ignored annotation is not read
			expect(code).not.toContain("styleValue");
			expect(message({ amount: 1234, style: "x" })).toBe("Total: 1234");
			expect(warn).toHaveBeenCalledWith(
				expect.stringContaining('"customLocalFormatter" is unknown')
			);
		} finally {
			warn.mockRestore();
		}
	});
});

describe("registryFunctions metadata", () => {
	const registryFunctions = (args: {
		declarations: Declaration[];
		selectors?: string[];
		variants: Array<{ matches?: Match[]; pattern: Pattern }>;
	}) => {
		const message: Message = {
			id: "message-id",
			bundleId: "locals_message",
			locale: "en",
			selectors: (args.selectors ?? []).map((name) => ({
				type: "variable-reference",
				name,
			})),
		};
		return compileMessage(
			args.declarations,
			message,
			args.variants.map((variant, index) => ({
				id: String(index),
				messageId: message.id,
				matches: variant.matches ?? [],
				pattern: variant.pattern,
			}))
		).registryFunctions;
	};

	test("message text that mentions the registry does not count", () => {
		expect(
			registryFunctions({
				declarations: [],
				variants: [{ pattern: [text("Open the registry. Now.")] }],
			})
		).toEqual([]);
	});

	test("an unread annotated local does not count", () => {
		expect(
			registryFunctions({
				declarations: [input("count"), local("countPlural", "count", plural())],
				variants: [{ pattern: [ref("count")] }],
			})
		).toEqual([]);
	});

	test("unknown local annotations do not count", () => {
		expect(
			registryFunctions({
				declarations: [
					input("value"),
					local("custom", "value", {
						type: "function-reference",
						name: "customFormatter",
						options: [],
					}),
				],
				variants: [{ pattern: [ref("custom")] }],
			})
		).toEqual([]);
	});

	test("unknown pattern annotations do not count", () => {
		expect(
			registryFunctions({
				declarations: [input("value")],
				variants: [
					{
						pattern: [
							{
								type: "expression",
								arg: { type: "variable-reference", name: "value" },
								annotation: {
									type: "function-reference",
									name: "customFormatter",
									options: [],
								},
							},
						],
					},
				],
			})
		).toEqual([]);
	});

	test("read locals and pattern annotations count, in both variant paths", () => {
		expect(
			registryFunctions({
				declarations: [input("count"), local("countPlural", "count", plural())],
				selectors: ["countPlural"],
				variants: [
					{ matches: [literal("countPlural", "one")], pattern: [text("one")] },
					{
						matches: [catchall("countPlural")],
						pattern: [
							{
								type: "expression",
								arg: { type: "variable-reference", name: "count" },
								annotation: {
									type: "function-reference",
									name: "icu:pound",
									options: [],
								},
							},
						],
					},
				],
			}).sort()
		).toEqual(["icuPound", "plural"]);
		expect(
			registryFunctions({
				declarations: [input("amount")],
				variants: [
					{
						pattern: [
							{
								type: "expression",
								arg: { type: "variable-reference", name: "amount" },
								annotation: {
									type: "function-reference",
									name: "number",
									options: [],
								},
							},
						],
					},
				],
			})
		).toEqual(["number"]);
	});
});
