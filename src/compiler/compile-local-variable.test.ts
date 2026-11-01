import { test, expect } from "vitest";
import { compileLocalVariable } from "./compile-local-variable.js";
import { compileLocalVariableName } from "./variable-access.js";

test("compiles a literal local variable", () => {
	const code = compileLocalVariable({
		locale: "en",
		declaration: {
			type: "local-variable",
			name: "myVar",
			value: { type: "expression", arg: { type: "literal", value: "Hello" } },
		},
	});
	expect(code).toEqual('const myVar = "Hello";');
});

test("compiles a variable reference local variable", () => {
	const code = compileLocalVariable({
		locale: "en",
		declaration: {
			type: "local-variable",
			name: "myVar",
			value: {
				type: "expression",
				arg: { type: "variable-reference", name: "name" },
			},
		},
	});
	expect(code).toEqual("const myVar = i?.name;");
});

test("compiles a variable reference to an earlier local variable", () => {
	const code = compileLocalVariable({
		locale: "en",
		declarations: [
			{
				type: "local-variable",
				name: "earlierLocal",
				value: { type: "expression", arg: { type: "literal", value: "42" } },
			},
		],
		declaration: {
			type: "local-variable",
			name: "myVar",
			value: {
				type: "expression",
				arg: { type: "variable-reference", name: "earlierLocal" },
			},
		},
	});

	expect(code).toEqual("const myVar = earlierLocal;");
});

test("compiles a variable reference local variable with a non-identifier name", () => {
	const code = compileLocalVariable({
		locale: "en",
		declaration: {
			type: "local-variable",
			name: "myVar",
			value: {
				type: "expression",
				arg: { type: "variable-reference", name: "half!" },
			},
		},
	});
	expect(code).toEqual('const myVar = i?.["half!"];');
});

test("compiles a local variable with an annotation and empty options", () => {
	const code = compileLocalVariable({
		locale: "en",
		declaration: {
			type: "local-variable",
			name: "myVar",
			value: {
				type: "expression",
				arg: { type: "literal", value: "Hello" },
				annotation: {
					type: "function-reference",
					name: "number",
					options: [],
				},
			},
		},
	});
	expect(code).toEqual('const myVar = __paraglideRegistry.number("en", "Hello", {}, true);');
});

test("interpolates the raw value for an unknown annotation, like a pattern", () => {
	const code = compileLocalVariable({
		locale: "en",
		declaration: {
			type: "local-variable",
			name: "myVar",
			value: {
				type: "expression",
				arg: { type: "variable-reference", name: "amount" },
				annotation: {
					type: "function-reference",
					name: "myFunction",
					options: [
						{ name: "option1", value: { type: "literal", value: "value1" } },
					],
				},
			},
		},
	});
	expect(code).toEqual("const myVar = i?.amount;");
});

test("compiles a local variable with an annotation and options", () => {
	const code = compileLocalVariable({
		locale: "en",
		declaration: {
			type: "local-variable",
			name: "myVar",
			value: {
				type: "expression",
				arg: { type: "literal", value: "Hello" },
				annotation: {
					type: "function-reference",
					name: "number",
					options: [
						{ name: "option1", value: { type: "literal", value: "value1" } },
						{
							name: "option2",
							value: { type: "variable-reference", name: "varRef" },
						},
					],
				},
			},
		},
	});
	expect(code).toEqual(
		'const myVar = __paraglideRegistry.number("en", "Hello", { option1: "value1", option2: i?.varRef }, true);'
	);
});

test("compiles formatter options referencing earlier local variables", () => {
	const code = compileLocalVariable({
		locale: "en",
		declarations: [
			{ type: "input-variable", name: "amount" },
			{
				type: "local-variable",
				name: "digits",
				value: { type: "expression", arg: { type: "literal", value: "2" } },
			},
		],
		declaration: {
			type: "local-variable",
			name: "formattedAmount",
			value: {
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
		},
	});

	expect(code).toEqual(
		'const formattedAmount = __paraglideRegistry.number("en", i?.amount, { minimumFractionDigits: digits }, true);'
	);
});

test("compiles number formatter fraction digit options as numeric literals", () => {
	const code = compileLocalVariable({
		locale: "en",
		declaration: {
			type: "local-variable",
			name: "formattedValue",
			value: {
				type: "expression",
				arg: { type: "variable-reference", name: "value" },
				annotation: {
					type: "function-reference",
					name: "number",
					options: [
						{
							name: "minimumFractionDigits",
							value: { type: "literal", value: "1" },
						},
						{
							name: "maximumFractionDigits",
							value: { type: "literal", value: "1" },
						},
					],
				},
			},
		},
	});

	expect(code).toEqual(
		'const formattedValue = __paraglideRegistry.number("en", i?.value, { minimumFractionDigits: 1, maximumFractionDigits: 1 }, true);'
	);
});

test("compiles number formatter useGrouping option as boolean literal", () => {
	const code = compileLocalVariable({
		locale: "en",
		declaration: {
			type: "local-variable",
			name: "formattedValue",
			value: {
				type: "expression",
				arg: { type: "variable-reference", name: "value" },
				annotation: {
					type: "function-reference",
					name: "number",
					options: [
						{
							name: "useGrouping",
							value: { type: "literal", value: "false" },
						},
					],
				},
			},
		},
	});

	expect(code).toEqual(
		'const formattedValue = __paraglideRegistry.number("en", i?.value, { useGrouping: false }, true);'
	);
});

test("keeps negative digit options as strings to avoid emitting invalid numeric literals", () => {
	const code = compileLocalVariable({
		locale: "en",
		declaration: {
			type: "local-variable",
			name: "formattedValue",
			value: {
				type: "expression",
				arg: { type: "variable-reference", name: "value" },
				annotation: {
					type: "function-reference",
					name: "number",
					options: [
						{
							name: "minimumFractionDigits",
							value: { type: "literal", value: "-1" },
						},
					],
				},
			},
		},
	});

	expect(code).toEqual(
		'const formattedValue = __paraglideRegistry.number("en", i?.value, { minimumFractionDigits: "-1" }, true);'
	);
});

test("compiles relative time formatter with a literal unit", () => {
	const code = compileLocalVariable({
		locale: "en",
		declaration: {
			type: "local-variable",
			name: "formattedDuration",
			value: {
				type: "expression",
				arg: { type: "variable-reference", name: "duration" },
				annotation: {
					type: "function-reference",
					name: "relativetime",
					options: [
						{ name: "unit", value: { type: "literal", value: "day" } },
						{ name: "numeric", value: { type: "literal", value: "auto" } },
						{ name: "style", value: { type: "literal", value: "short" } },
					],
				},
			},
		},
	});

	expect(code).toEqual(
		'const formattedDuration = __paraglideRegistry.relativetime("en", i?.duration, { unit: "day", numeric: "auto", style: "short" }, true);'
	);
});

test("compiles relative time formatter with a dynamic unit cast", () => {
	const code = compileLocalVariable({
		locale: "en",
		declaration: {
			type: "local-variable",
			name: "formattedDuration",
			value: {
				type: "expression",
				arg: { type: "variable-reference", name: "duration" },
				annotation: {
					type: "function-reference",
					name: "relativetime",
					options: [
						{
							name: "unit",
							value: { type: "variable-reference", name: "unit" },
						},
						{ name: "style", value: { type: "literal", value: "short" } },
					],
				},
			},
		},
	});

	expect(code).toEqual(
		'const formattedDuration = __paraglideRegistry.relativetime("en", i?.duration, { unit: /** @type {import("../registry.js").RelativeTimeFormatUnit} */ (i?.unit), style: "short" }, true);'
	);
});

test("throws if relative time formatter is missing a unit option", () => {
	expect(() =>
		compileLocalVariable({
			locale: "en",
			declaration: {
				type: "local-variable",
				name: "formattedDuration",
				value: {
					type: "expression",
					arg: { type: "variable-reference", name: "duration" },
					annotation: {
						type: "function-reference",
						name: "relativetime",
						options: [],
					},
				},
			},
		})
	).toThrow('The "relativetime" formatter requires a "unit" option.');
});

test("throws if relative time formatter has duplicate unit options", () => {
	expect(() =>
		compileLocalVariable({
			locale: "en",
			declaration: {
				type: "local-variable",
				name: "formattedDuration",
				value: {
					type: "expression",
					arg: { type: "variable-reference", name: "duration" },
					annotation: {
						type: "function-reference",
						name: "relativetime",
						options: [
							{ name: "unit", value: { type: "literal", value: "day" } },
							{ name: "unit", value: { type: "literal", value: "hour" } },
						],
					},
				},
			},
		})
	).toThrow('The "relativetime" formatter requires exactly one "unit" option.');
});

test("throws if relative time formatter has an invalid literal unit", () => {
	expect(() =>
		compileLocalVariable({
			locale: "en",
			declaration: {
				type: "local-variable",
				name: "formattedDuration",
				value: {
					type: "expression",
					arg: { type: "variable-reference", name: "duration" },
					annotation: {
						type: "function-reference",
						name: "relativetime",
						options: [
							{ name: "unit", value: { type: "literal", value: "century" } },
						],
					},
				},
			},
		})
	).toThrow('Invalid "relativetime" unit "century".');
});

test("accepts plural relative time formatter units", () => {
	const code = compileLocalVariable({
		locale: "en",
		declaration: {
			type: "local-variable",
			name: "formattedDuration",
			value: {
				type: "expression",
				arg: { type: "variable-reference", name: "duration" },
				annotation: {
					type: "function-reference",
					name: "relativetime",
					options: [
						{ name: "unit", value: { type: "literal", value: "days" } },
					],
				},
			},
		},
	});

	expect(code).toEqual(
		'const formattedDuration = __paraglideRegistry.relativetime("en", i?.duration, { unit: "days" }, true);'
	);
});

test("accepts dynamic relative time formatter units", () => {
	const code = compileLocalVariable({
		locale: "en",
		declaration: {
			type: "local-variable",
			name: "formattedDuration",
			value: {
				type: "expression",
				arg: { type: "variable-reference", name: "duration" },
				annotation: {
					type: "function-reference",
					name: "relativetime",
					options: [
						{
							name: "unit",
							value: { type: "variable-reference", name: "unit" },
						},
					],
				},
			},
		},
	});

	expect(code).toEqual(
		'const formattedDuration = __paraglideRegistry.relativetime("en", i?.duration, { unit: /** @type {import("../registry.js").RelativeTimeFormatUnit} */ (i?.unit) }, true);'
	);
});

test("accepts dollar-prefixed relative time formatter unit options from message files", () => {
	const code = compileLocalVariable({
		locale: "en",
		declaration: {
			type: "local-variable",
			name: "formattedDuration",
			value: {
				type: "expression",
				arg: { type: "variable-reference", name: "duration" },
				annotation: {
					type: "function-reference",
					name: "relativetime",
					options: [
						{ name: "unit", value: { type: "literal", value: "$unit" } },
					],
				},
			},
		},
	});

	expect(code).toEqual(
		'const formattedDuration = __paraglideRegistry.relativetime("en", i?.duration, { unit: /** @type {import("../registry.js").RelativeTimeFormatUnit} */ (i?.unit) }, true);'
	);
});

test("compiles dollar-prefixed relative time units referencing local variables", () => {
	const code = compileLocalVariable({
		locale: "en",
		declarations: [
			{ type: "input-variable", name: "duration" },
			{
				type: "local-variable",
				name: "localUnit",
				value: { type: "expression", arg: { type: "literal", value: "day" } },
			},
		],
		declaration: {
			type: "local-variable",
			name: "formattedDuration",
			value: {
				type: "expression",
				arg: { type: "variable-reference", name: "duration" },
				annotation: {
					type: "function-reference",
					name: "relativetime",
					options: [
						{ name: "unit", value: { type: "literal", value: "$localUnit" } },
					],
				},
			},
		},
	});

	expect(code).toEqual(
		'const formattedDuration = __paraglideRegistry.relativetime("en", i?.duration, { unit: /** @type {import("../registry.js").RelativeTimeFormatUnit} */ (localUnit) }, true);'
	);
});

test("accepts dollar-prefixed relative time formatter unit options with non-identifier input names", () => {
	const code = compileLocalVariable({
		locale: "en",
		declaration: {
			type: "local-variable",
			name: "formattedDuration",
			value: {
				type: "expression",
				arg: { type: "variable-reference", name: "duration" },
				annotation: {
					type: "function-reference",
					name: "relativetime",
					options: [
						{
							name: "unit",
							value: { type: "literal", value: "$relative-unit" },
						},
					],
				},
			},
		},
	});

	expect(code).toEqual(
		'const formattedDuration = __paraglideRegistry.relativetime("en", i?.duration, { unit: /** @type {import("../registry.js").RelativeTimeFormatUnit} */ (i?.["relative-unit"]) }, true);'
	);
});

test.each([
	["date", '{ dateStyle: "medium" }'],
	["time", '{ timeStyle: "medium" }'],
	["datetime", '{ dateStyle: "medium", timeStyle: "short" }'],
])("compiles a %s local variable with its default style", (name, options) => {
	const code = compileLocalVariable({
		locale: "en",
		declaration: {
			type: "local-variable",
			name: "formatted",
			value: {
				type: "expression",
				arg: { type: "variable-reference", name: "d" },
				annotation: { type: "function-reference", name, options: [] },
			},
		},
	});
	expect(code).toBe(
		`const formatted = __paraglideRegistry.datetime("en", i?.d, ${options}, true);`
	);
});

test("declares a local that cannot be a binding, or would shadow one the message reads, under a distinct private name", () => {
	const code = compileLocalVariable({
		locale: "en",
		declarations: [{ type: "input-variable", name: "count" }],
		declaration: {
			type: "local-variable",
			name: "i",
			value: {
				type: "expression",
				arg: { type: "variable-reference", name: "count" },
			},
		},
	});
	expect(code).toBe("const $i = i?.count;");
	const names = [
		"count",
		"registry",
		"i",
		"String",
		"__paraglideRegistry",
		"class",
		"eval",
		"a-b",
		"a_b",
		"$i",
	];
	expect(names.map(compileLocalVariableName)).toEqual([
		"count",
		"registry",
		"$i",
		"$$53$tring",
		"$__paraglide$52$egistry",
		"$class",
		"$eval",
		"$a$2d$b",
		"a_b",
		"$$24$i",
	]);
});
