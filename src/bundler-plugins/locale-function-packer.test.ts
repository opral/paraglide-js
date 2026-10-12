import { expect, test } from "vitest";
import { packLocaleFunctionChunk } from "./locale-function-packer.js";

function localName(locale: string, index: number): string {
	const encodedLocale =
		Array.from(locale, (character) =>
			character.codePointAt(0)!.toString(16)
		).join("_") || "x";
	return `__paraglide_locale_fn_l${Array.from(locale).length}_${encodedLocale}_n${index}`;
}

async function importCode(code: string) {
	return import(
		`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`
	);
}

test("packs private static-text helper calls into locale-major arrays", async () => {
	const english = [
		'quote: "; slash: \\\\; newline: \n; </script>',
		"backtick: `; tab: \t; unicode: 🦆",
		...Array.from({ length: 14 }, (_, index) => `English message ${index}`),
	];
	const german = Array.from(
		{ length: 16 },
		(_, index) => `German message ${index}`
	);
	const values = [...english, ...german];
	const names = [
		...english.map((_, index) => localName("en", index)),
		...german.map((_, index) => localName("de", index)),
	];
	const source = [
		'"use strict";',
		...names.map(
			(name, index) =>
				`const ${name} = () => { return ${JSON.stringify(values[index])}; };`
		),
		`export const read = () => [${names.map((name) => `${name}()`).join(",")}];`,
	].join("\n");
	const packed = packLocaleFunctionChunk(source, {
		fileName: "entry.js",
		sourcemap: true,
	});

	expect(packed).not.toBeNull();
	expect(packed?.code).toContain(
		`const __paraglide_packed_locale_l2_65_6e_0 = [${english.map((value) => JSON.stringify(value)).join(",")}];`
	);
	expect(packed?.code).toContain(
		`const __paraglide_packed_locale_l2_64_65_0 = [${german.map((value) => JSON.stringify(value)).join(",")}];`
	);
	for (const name of names) expect(packed?.code).not.toContain(`${name} =`);
	expect(packed?.map).not.toBeNull();
	expect((await importCode(packed!.code)).read()).toEqual(values);
});

test("skips small and identical-only locale groups", () => {
	const smallNames = Array.from({ length: 15 }, (_, index) =>
		localName("en", index)
	);
	const smallGroup = [
		...smallNames.map(
			(name, index) => `const ${name} = () => { return "value ${index}"; };`
		),
		`export const read = () => [${smallNames.map((name) => `${name}()`).join(",")}];`,
	].join("\n");
	expect(packLocaleFunctionChunk(smallGroup)).toBeNull();

	const identicalNames = Array.from({ length: 16 }, (_, index) =>
		localName("en", index)
	);
	const identicalGroup = [
		...identicalNames.map(
			(name) => `const ${name} = () => { return "same"; };`
		),
		`export const read = () => [${identicalNames.map((name) => `${name}()`).join(",")}];`,
	].join("\n");
	expect(packLocaleFunctionChunk(identicalGroup)).toBeNull();
});

test("keeps exported, escaped, aliased, and reassigned helpers unchanged", async () => {
	const safeNames = Array.from({ length: 16 }, (_, index) =>
		localName("en", index)
	);
	const safeValues = safeNames.map((_, index) => `safe ${index}`);
	const escaped = localName("en", 16);
	const exported = localName("en", 17);
	const aliased = localName("en", 18);
	const reassigned = localName("en", 19);
	const source = [
		...safeNames.map(
			(name, index) =>
				`const ${name} = () => { return ${JSON.stringify(safeValues[index])}; };`
		),
		`const ${escaped} = () => { return "whole function"; };`,
		`const ${exported} = () => { return "export me"; };`,
		`const ${aliased} = () => { return "aliased function"; };`,
		`let ${reassigned} = () => { return "original"; };`,
		`export const safe = () => [${safeNames.map((name) => `${name}()`).join(",")}];`,
		`export const escape = () => { const alias = ${escaped}; return alias(); };`,
		`export const scalarAlias = () => { const alias = ${aliased}; return alias(); };`,
		`export { ${exported} as visibleHelper };`,
		`export const replace = () => { ${reassigned} = () => "changed"; return ${reassigned}(); };`,
	].join("\n");
	const packed = packLocaleFunctionChunk(source);
	expect(packed).not.toBeNull();
	expect(packed?.code).toContain(
		`[${safeValues.map((value) => JSON.stringify(value)).join(",")}]`
	);
	for (const value of [
		"whole function",
		"export me",
		"aliased function",
		"original",
	]) {
		expect(packed?.code).toContain(JSON.stringify(value));
	}
	const module = await importCode(packed!.code);
	expect(module.safe()).toEqual(safeValues);
	expect(module.escape()).toBe("whole function");
	expect(module.scalarAlias()).toBe("aliased function");
	expect(module.visibleHelper()).toBe("export me");
	expect(module.replace()).toBe("changed");
});

test("preserves argument effects and evaluation order", async () => {
	const names = Array.from({ length: 16 }, (_, index) =>
		localName("fx", index)
	);
	const values = names.map((_, index) => `value ${index}`);
	const source = [
		`let effects = "";`,
		`function record(value) { effects += value; return value; }`,
		...names.map(
			(name, index) =>
				`const ${name} = () => { return ${JSON.stringify(values[index])}; };`
		),
		`export const value = [${names.map((name, index) => `${name}(record(${JSON.stringify(String(index))}))`).join(",")}];`,
		`export { effects };`,
	].join("\n");
	const packed = packLocaleFunctionChunk(source);
	expect(packed).not.toBeNull();
	const module = await importCode(packed!.code);
	expect(module.value).toEqual(values);
	expect(module.effects).toBe("0123456789101112131415");
});

test("keeps an outer helper call when its arguments contain packable helper calls", async () => {
	const outer = localName("en", 0);
	const innerNames = Array.from({ length: 16 }, (_, index) =>
		localName("en", index + 1)
	);
	const innerValues = innerNames.map((_, index) => `inner ${index}`);
	const source = [
		`let order = "";`,
		`function record(value) { order += value; return value; }`,
		`const ${outer} = () => { return "outer"; };`,
		...innerNames.map(
			(name, index) =>
				`const ${name} = () => { return ${JSON.stringify(innerValues[index])}; };`
		),
		`export const read = () => ${outer}(${innerNames.map((name) => `record(${name}())`).join(",")});`,
		`export const getOrder = () => order;`,
	].join("\n");
	const packed = packLocaleFunctionChunk(source);

	expect(packed).not.toBeNull();
	expect(packed?.code).toContain(`${outer} = () =>`);
	expect(packed?.code).toContain(`${outer}(`);
	for (const name of innerNames)
		expect(packed?.code).not.toContain(`${name} =`);
	const module = await importCode(packed!.code);
	expect(module.read()).toBe("outer");
	expect(module.getOrder()).toBe(innerValues.join(""));
});

test("keeps hoisted calls before a function initializer on their original binding", async () => {
	const safeNames = [
		localName("en", 0),
		...Array.from({ length: 15 }, (_, index) => localName("en", index + 2)),
	];
	const safeValues = safeNames.map((_, index) => `safe ${index}`);
	const later = localName("en", 1);
	const source = [
		`var ${safeNames[0]} = () => { return ${JSON.stringify(safeValues[0])}; };`,
		"export const early = readEarly();",
		`var ${later} = () => { return "later"; };`,
		...safeNames
			.slice(1)
			.map(
				(name, index) =>
					`var ${name} = () => { return ${JSON.stringify(safeValues[index + 1])}; };`
			),
		`function readEarly() { try { return ${later}(); } catch { return undefined; } }`,
		`export const after = () => [${safeNames.map((name) => `${name}()`).join(",")}, ${later}()];`,
	].join("\n");
	const packed = packLocaleFunctionChunk(source);
	expect(packed).not.toBeNull();
	expect(packed?.code).toContain(`${later}()`);
	expect(packed?.code).toContain(
		`[${safeValues.map((value) => JSON.stringify(value)).join(",")}]`
	);
	const module = await importCode(packed!.code);
	expect(module.early).toBeUndefined();
	expect(module.after()).toEqual([...safeValues, "later"]);
});

test("leaves spread calls and dynamic-scope chunks unchanged", () => {
	const spreadName = localName("en", 0);
	const safeNames = Array.from({ length: 16 }, (_, index) =>
		localName("en", index + 1)
	);
	const spread = [
		`const ${spreadName} = () => { return "spread"; };`,
		...safeNames.map(
			(name, index) => `const ${name} = () => { return "safe ${index}"; };`
		),
		`export const read = (args) => [${spreadName}(...args), ${safeNames.map((name) => `${name}()`).join(",")}];`,
	].join("\n");
	const packed = packLocaleFunctionChunk(spread);
	expect(packed).not.toBeNull();
	expect(packed?.code).toContain(`${spreadName}(...args)`);
	for (const name of safeNames) expect(packed?.code).not.toContain(`${name} =`);
	const evalChunk = `${spread}\nexport const dynamic = () => eval("1");`;
	expect(packLocaleFunctionChunk(evalChunk)).toBeNull();
	const withChunk = `${spread}\nwith (globalThis) {}`;
	expect(packLocaleFunctionChunk(withChunk)).toBeNull();
});

test("rejects nonstatic function helpers and malformed generated names", () => {
	const functionHelper = localName("en", 0);
	const safeNames = Array.from({ length: 16 }, (_, index) =>
		localName("en", index + 1)
	);
	const source = [
		`const ${functionHelper} = function named() { return "keep function"; };`,
		...safeNames.map(
			(name, index) => `const ${name} = () => { return "safe ${index}"; };`
		),
		`export const read = () => [${functionHelper}(), ${safeNames.map((name) => `${name}()`).join(",")}];`,
	].join("\n");
	const packed = packLocaleFunctionChunk(source);
	expect(packed).not.toBeNull();
	expect(packed?.code).toContain(`${functionHelper} = function named`);
	for (const name of safeNames) expect(packed?.code).not.toContain(`${name} =`);
	expect(
		packLocaleFunctionChunk(
			`const __paraglide_locale_fn_l2_bad_n1 = () => { return "bad"; };`
		)
	).toBeNull();
});
