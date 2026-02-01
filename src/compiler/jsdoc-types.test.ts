import { test, expect } from "vitest";
import { inputsType, jsDocBundleFunctionTypes } from "./jsdoc-types.js";
import type { InputVariable } from "@inlang/sdk";

test("inputsType generates unique parameter types even when the same input appears multiple times", () => {
	// Simulate a case where the same input appears multiple times (like in a translation with placeholders)
	const inputs: InputVariable[] = [
		{ name: "days", type: "input-variable" },
		{ name: "days", type: "input-variable" }, // Duplicated input
	];

	// The generated input type should only include each parameter once
	const result = inputsType(inputs);
	expect(result).toBe("{ days: NonNullable<unknown> }");

	// It should not generate a duplicate parameter
	expect(result).not.toBe(
		"{ days: NonNullable<unknown>, days: NonNullable<unknown> }"
	);
});

test("inputsType quotes non-identifier input names", () => {
	const inputs: InputVariable[] = [{ name: "half!", type: "input-variable" }];

	const result = inputsType(inputs);

	expect(result).toBe('{ "half!": NonNullable<unknown> }');
});

test("jsDocBundleFunctionTypes correctly handles messages with duplicate inputs", () => {
	const inputs: InputVariable[] = [
		{ name: "days", type: "input-variable" },
		{ name: "days", type: "input-variable" }, // Duplicated input
	];

	const locales = ["en-us", "de-de"];

	const result = jsDocBundleFunctionTypes({ inputs, locales });

	// The JSDoc should only include each parameter once
	expect(result).toContain("@param {{ days: NonNullable<unknown> }} inputs");

	// It should not contain duplicated parameters
	expect(result).not.toContain(
		"@param {{ days: NonNullable<unknown>, days: NonNullable<unknown> }} inputs"
	);
});

test("jsDocBundleFunctionTypes returns LocalizedString type", () => {
	const inputs: InputVariable[] = [];
	const locales = ["en", "de"];

	const result = jsDocBundleFunctionTypes({ inputs, locales });

	// The JSDoc should specify LocalizedString as the return type
	expect(result).toContain("@returns {LocalizedString}");

	// It should not return plain string
	expect(result).not.toContain("@returns {string}");
});

test("inputsType emits literal unions for match values", () => {
	const inputs: InputVariable[] = [
		{ name: "type", type: "input-variable" },
		{ name: "status", type: "input-variable" },
	];

	const matchTypes = new Map([
		[
			"type",
			{
				literals: new Set(["invalid", "empty", "min_length"]),
				hasCatchAll: false,
			},
		],
		["status", { literals: new Set(["ready", "done"]), hasCatchAll: false }],
	]);

	const result = inputsType(inputs, matchTypes);

	expect(result).toBe(
		'{ type: "empty" | "invalid" | "min_length", status: "done" | "ready" }'
	);
});

test("inputsType falls back to NonNullable<unknown> when catchall exists", () => {
	const inputs: InputVariable[] = [{ name: "type", type: "input-variable" }];

	const matchTypes = new Map([
		["type", { literals: new Set(["invalid"]), hasCatchAll: true }],
	]);

	const result = inputsType(inputs, matchTypes);

	expect(result).toBe("{ type: NonNullable<unknown> }");
});

test("inputsType falls back to NonNullable<unknown> when no match info exists", () => {
	const inputs: InputVariable[] = [{ name: "type", type: "input-variable" }];

	const result = inputsType(inputs);

	expect(result).toBe("{ type: NonNullable<unknown> }");
});
