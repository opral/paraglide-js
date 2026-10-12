import { expect, test } from "vitest";
import { packDispatchMatrixChunk } from "./dispatch-matrix-packer.js";
import { createViteDispatchMarker } from "../compiler/vite-dispatch-marker.js";

const marker = createViteDispatchMarker("es");
const source = (count = 32, prefix = "message", base = "es") => {
	const name = createViteDispatchMarker(base);
	return Array.from(
		{ length: count },
		(_, index) =>
			`export const ${prefix}${index} = (inputs = {}, options = {}) => { void inputs; const ${name} = options.locale ?? getLocale(); if (${name} === "en") return "English ${index}"; if (${name} === "de") return "Deutsch ${index}"; ${["fr", "it", "pt", "ru", "ja"].map((locale) => `if (${name} === "${locale}") return "${locale} ${index}";`).join(" ")} return "Base ${index}"; };`
	).join("\n");
};
const load = (code: string) =>
	import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);

test("preserves explicit locale overrides, non-English base fallback, exports and function metadata", async () => {
	const code = `let current = 'es'; const getLocale = () => current; export const setLocale = locale => current = locale;\n${source()}\nmessage0.parts = () => [{type:'text',value:message0()}]; message0.custom = 'retained';`;
	const packed = packDispatchMatrixChunk(code, {
		fileName: "messages.js",
		sourcemap: true,
	});
	expect(packed).not.toBeNull();
	expect(packed!.map?.sourcesContent).toEqual([code]);
	expect(packed!.map?.mappings.length).toBeGreaterThan(0);
	const before = await load(code),
		after = await load(packed!.code);
	expect(Object.keys(after)).toEqual(Object.keys(before));
	for (const locale of [
		"en",
		"de",
		"es",
		"missing",
		"constructor",
		"__proto__",
		null,
		1,
		Symbol("de"),
		new String("de"),
		{
			toString() {
				throw new Error("must not coerce locale");
			},
		},
	]) {
		for (let index = 0; index < 32; index++)
			expect(after[`message${index}`]({}, { locale })).toBe(
				before[`message${index}`]({}, { locale })
			);
	}
	for (const locale of ["en", "de", "en"]) {
		before.setLocale(locale);
		after.setLocale(locale);
		expect(after.message0()).toBe(before.message0());
		expect(after.message0.parts()).toEqual(before.message0.parts());
	}
	expect(after.message0.name).toBe(before.message0.name);
	expect(after.message0.length).toBe(before.message0.length);
	expect(Object.keys(after.message0)).toEqual(Object.keys(before.message0));
	expect(after.message0.custom).toBe("retained");
	let reads = 0;
	expect(
		after.message0(
			{},
			{
				get locale() {
					reads++;
					return "de";
				},
			}
		)
	).toBe("Deutsch 0");
	expect(reads).toBe(1);
	expect(() => after.message0({}, null)).toThrow();
});

test("leaves small, mixed and nested dispatchers intact beside qualifying groups", async () => {
	const mixed = `export const mixed = (inputs, options = {}) => { const ${marker} = options.locale ?? getLocale(); if (${marker} === 'en') return 'English'; if (${marker} === 'de') return inputs.name; return 'Base'; };`;
	const code = `const getLocale = () => 'en';\n${source()}\n${source(2, "small", "fr")}\n${mixed}\nexport const nested = () => { ${source(1, "inner").replace("export ", "")} return inner0(); };`;
	const packed = packDispatchMatrixChunk(code)!;
	expect(packed).not.toBeNull();
	expect(packed.code).toContain(source(2, "small", "fr"));
	expect(packed.code).toContain(mixed);
	const module = await load(packed.code);
	expect(module.small1()).toBe("English 1");
	expect(module.mixed({ name: "name" }, { locale: "de" })).toBe("name");
	expect(module.nested()).toBe("English 0");
});

test("skips dynamic scope, unsupported dispatcher shapes and ordinary user functions", () => {
	const valid = `const getLocale = () => 'es';\n${source()}`;
	for (const suffix of [
		"eval /* comment */ ('message0');",
		"function nestedEval() { return eval('message0'); }",
	])
		expect(packDispatchMatrixChunk(`${valid}\n${suffix}`)).toBeNull();
	expect(
		packDispatchMatrixChunk(valid.replaceAll(marker, "locale"))
	).toBeNull();
	expect(
		packDispatchMatrixChunk(`const getLocale = () => 'es';\n${source(31)}`)
	).toBeNull();
	expect(
		packDispatchMatrixChunk(
			valid.replaceAll('return "English', 'return inputs.value + "English')
		)
	).toBeNull();
	expect(
		packDispatchMatrixChunk(
			valid.replaceAll("const " + marker, "let other=1; const " + marker)
		)
	).toBeNull();
	expect(
		packDispatchMatrixChunk(
			valid.replaceAll(`if (${marker} === "en")`, `if (${marker} == "en")`)
		)
	).toBeNull();
	expect(
		packDispatchMatrixChunk(
			valid.replaceAll(`if (${marker} === "de")`, `if (${marker} === "en")`)
		)
	).toBeNull();
	expect(
		packDispatchMatrixChunk(
			valid
				.replaceAll('return "English', "return `English")
				.replaceAll('"; if', "`; if")
		)
	).toBeNull();
});

test("retains hashbang/directive prologues and avoids binding name collisions", async () => {
	const code = `#!/usr/bin/env node\n'use strict';\nconst __paraglide_dispatch_matrix_0 = 'collision'; const __paraglide_dispatch_select_2 = 'collision'; const getLocale=()=> 'es';\n${source()}`;
	const packed = packDispatchMatrixChunk(code)!;
	expect(packed.code.startsWith("#!/usr/bin/env node\n'use strict';")).toBe(
		true
	);
	expect(packed.code).toContain("const __paraglide_dispatch_matrix_1 =");
	const module = await load(packed.code.replace(/^#![^\n]*\n/, ""));
	expect(module.message0()).toBe("Base 0");
});

test("preserves escaped literal values and first evaluation of locale/inputs", async () => {
	const text = 'quotes " backtick ` backslash \\ newline \n 🦆 </script>';
	const code = `const getLocale=()=> 'es';\n${source().replace('"Base 0"', JSON.stringify(text))}`;
	const packed = packDispatchMatrixChunk(code)!;
	expect((await load(packed.code)).message0()).toBe(text);
});
