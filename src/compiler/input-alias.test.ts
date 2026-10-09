import { expect, test } from "vitest";
import type { Declaration } from "@inlang/sdk";
import { resolveInputAlias } from "./input-alias.js";

const alias = (name: string, target: string): Declaration => ({
	type: "local-variable",
	name,
	value: {
		type: "expression",
		arg: { type: "variable-reference", name: target },
	},
});

test("resolves inputs and chains of un-annotated aliases to the input", () => {
	const declarations: Declaration[] = [
		{ type: "input-variable", name: "count" },
		alias("a", "count"),
		alias("b", "a"),
	];

	expect(resolveInputAlias("count", declarations)).toBe("count");
	expect(resolveInputAlias("a", declarations)).toBe("count");
	expect(resolveInputAlias("b", declarations)).toBe("count");
});

test("does not resolve annotated locals, literals, aliases of them, or undeclared names", () => {
	const declarations: Declaration[] = [
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
		alias("pluralAlias", "countPlural"),
		{
			type: "local-variable",
			name: "constant",
			value: { type: "expression", arg: { type: "literal", value: "0" } },
		},
		alias("undeclaredAlias", "missing"),
	];

	expect(resolveInputAlias("countPlural", declarations)).toBeUndefined();
	expect(resolveInputAlias("pluralAlias", declarations)).toBeUndefined();
	expect(resolveInputAlias("constant", declarations)).toBeUndefined();
	expect(resolveInputAlias("undeclaredAlias", declarations)).toBeUndefined();
	expect(resolveInputAlias("missing", declarations)).toBeUndefined();
});

test("terminates on cyclic aliases", () => {
	const declarations: Declaration[] = [
		alias("self", "self"),
		alias("a", "b"),
		alias("b", "c"),
		alias("c", "a"),
	];

	expect(resolveInputAlias("self", declarations)).toBeUndefined();
	expect(resolveInputAlias("a", declarations)).toBeUndefined();
	expect(resolveInputAlias("c", declarations)).toBeUndefined();
});
