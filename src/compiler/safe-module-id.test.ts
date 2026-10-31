import { test, expect } from "vitest";
import { allocateModuleIds, toSafeModuleId } from "./safe-module-id.js";

test("handles emojis (because why not)", () => {
	expect(toSafeModuleId("helloWorld🍌")).toBe("helloworld__1");
});

// https://github.com/opral/inlang-paraglide-js/issues/395
test("makes everything lowercase", () => {
	expect(toSafeModuleId("HelloWorld")).toBe("helloworld2");
});

test('escapes "-" to "_"', () => {
	expect(toSafeModuleId("de-DE-bavaria")).toBe("de_de_bavaria2");
});

test("prefixes with _ if it starts with a number", () => {
	expect(toSafeModuleId("123")).toBe("_123");
});

test("handles $ signs", () => {
	expect(toSafeModuleId("default_e$")).toBe("default_e_");
});

test("handles . dots", () => {
	expect(toSafeModuleId("hello.world.nested")).toBe("hello_world_nested");
});

test("handles : colons", () => {
	expect(toSafeModuleId("hello:world:nested")).toBe("hello_world_nested");
});

test("transforms js reserved keywords", async () => {
	expect(toSafeModuleId("import")).toBe("_import");
	expect(toSafeModuleId("let")).toBe("_let");
	// https://github.com/opral/inlang-paraglide-js/issues/331
	expect(toSafeModuleId("then")).toBe("_then");
});

test("adds an uppercase counter for de-duplication", async () => {
	expect(toSafeModuleId("helloworld")).toBe("helloworld");
	expect(toSafeModuleId("helloWorld")).toBe("helloworld1");
	expect(toSafeModuleId("HelloWorld")).toBe("helloworld2");
});

test("a key keeps its safe module id unless another key shares it", () => {
	const reserved = new Set(["_index"]);
	const ids = ["a.b", "a_b", "x.y", "Ab", "_index", "eval", "Eval", "registry"];
	const expected = {
		// a_b is its own safe module id; a.b shares it, so it is escaped
		"a.b": "$a$2e$b",
		a_b: "a_b",
		"x.y": "x_y",
		Ab: "ab1",
		// reserved, or not a valid binding
		_index: "$_index",
		eval: "$eval",
		Eval: "eval1",
		registry: "registry",
	};
	expect(Object.fromEntries(allocateModuleIds(ids, reserved))).toEqual(
		expected
	);
	expect(
		Object.fromEntries(allocateModuleIds([...ids].reverse(), reserved))
	).toEqual(expected);
	// Added keys move only the keys that share their safe module id.
	expect(
		Object.fromEntries(
			allocateModuleIds([...ids, "a_b_1", "registry_1", "x-y"], reserved)
		)
	).toEqual({
		...expected,
		a_b_1: "a_b_1",
		registry_1: "registry_1",
		"x.y": "$x$2e$y",
		"x-y": "$x$2d$y",
	});
});
