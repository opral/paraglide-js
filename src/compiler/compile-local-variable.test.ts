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
