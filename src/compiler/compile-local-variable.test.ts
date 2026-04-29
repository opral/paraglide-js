import { test, expect } from "vitest";
import { compileLocalVariable } from "./compile-local-variable.js";

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
					name: "myFunction",
					options: [],
				},
			},
		},
	});
	expect(code).toEqual('const myVar = registry.myFunction("en", "Hello", {});');
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
					name: "myFunction",
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
		'const myVar = registry.myFunction("en", "Hello", { option1: "value1", option2: i?.varRef });'
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
		'const formattedValue = registry.number("en", i?.value, { minimumFractionDigits: 1, maximumFractionDigits: 1 });'
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
		'const formattedValue = registry.number("en", i?.value, { useGrouping: false });'
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
		'const formattedValue = registry.number("en", i?.value, { minimumFractionDigits: "-1" });'
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
						{
							name: "style",
							value: { type: "literal", value: "short" },
						},
					],
				},
			},
		},
	});

	expect(code).toEqual(
		'const formattedDuration = registry.relativetime("en", i?.duration, { unit: "day", numeric: "auto", style: "short" });'
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
						{
							name: "style",
							value: { type: "literal", value: "short" },
						},
					],
				},
			},
		},
	});

	expect(code).toEqual(
		'const formattedDuration = registry.relativetime("en", i?.duration, { unit: /** @type {import("../registry.js").RelativeTimeFormatUnit} */ (i?.unit), style: "short" });'
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
		'const formattedDuration = registry.relativetime("en", i?.duration, { unit: "days" });'
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
		'const formattedDuration = registry.relativetime("en", i?.duration, { unit: /** @type {import("../registry.js").RelativeTimeFormatUnit} */ (i?.unit) });'
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
		'const formattedDuration = registry.relativetime("en", i?.duration, { unit: /** @type {import("../registry.js").RelativeTimeFormatUnit} */ (i?.unit) });'
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
		'const formattedDuration = registry.relativetime("en", i?.duration, { unit: /** @type {import("../registry.js").RelativeTimeFormatUnit} */ (i?.["relative-unit"]) });'
	);
});
