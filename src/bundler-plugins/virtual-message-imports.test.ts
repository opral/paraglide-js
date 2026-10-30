import { expect, test } from "vitest";
import { parseAst } from "vite";
import type { Program } from "estree";
import { rewriteVirtualMessageImports } from "./virtual-message-imports.js";
import { createRuntimeFile } from "../compiler/runtime/create-runtime.js";
import { defaultCompilerOptions } from "../compiler/compiler-options.js";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { pathToFileURL } from "node:url";

function rewrite(
	code: string,
	messages = new Map(
		["hello", "greeting.hello", "m", "class"].map((name) => [
			name,
			`virtual:test/${name}.js`,
		])
	)
) {
	return rewriteVirtualMessageImports({
		code,
		id: "app.js",
		ast: parseAst(code) as unknown as Program,
		imports: new Set(["./messages.js"]),
		messages,
	});
}

test("static namespace reads and named imports become direct imports with source maps", () => {
	const code = `import {m as messages, hello as greet} from './messages.js'; const __paraglide_message_0=0; export const output=[messages.hello(),messages['greeting.hello'](),messages.m(),messages.class(),greet(),__paraglide_message_0];`;
	const result = rewrite(code)!;
	expect(result.code).toContain('"virtual:test/greeting.hello.js"');
	expect(result.code).toContain("__paraglide_message_1");
	expect(result.code).not.toContain("messages.hello()");
	expect(result.map.sourcesContent).toEqual([code]);
	expect(result.map.mappings.length).toBeGreaterThan(0);
});

test.each([
	"m[key]()",
	"Object.keys(m)",
	"({...m})",
	"m.unknown",
	"m.hello=other",
	"delete m.hello",
	"m.hello++",
	"m?.hello()",
	"for(m.hello of values){}",
	"({x:m.hello}=other)",
	"const f=(m)=>m.hello()",
	"use(m)",
	'm.hello(); eval("m.hello()")',
	'm.hello(); eval?.("m.hello()")',
	"const {...rest}=m",
	"const {[key]:value}=m",
	"const {missing}=m",
	"const [first]=m",
	"m[`hel${suffix}`]()",
	"let hello; use(({hello}=m))",
])(
	"ambiguous or mutable namespace usage keeps the barrel: %s",
	(expression) => {
		expect(
			rewrite(`import {m} from './messages.js'; ${expression};`)
		).toBeNull();
	}
);

/**
 * Runs `code` as written and as rewritten against message modules named
 * `names`, and returns both modules' `output` exports.
 */
async function runBoth(code: string, names: string[]) {
	const root = await fs.realpath(
		await fs.mkdtemp(path.join(os.tmpdir(), "paraglide-patterns-"))
	);
	try {
		await fs.writeFile(path.join(root, "package.json"), '{"type":"module"}');
		for (const name of names)
			await fs.writeFile(
				path.join(root, `${name}.js`),
				`const message = () => ${JSON.stringify(name)};\nexport { message as ${JSON.stringify(name)} };`
			);
		await fs.writeFile(
			path.join(root, "messages.js"),
			'export * as m from "./barrel.js";'
		);
		await fs.writeFile(
			path.join(root, "barrel.js"),
			names
				.map((name) => `export * from ${JSON.stringify(`./${name}.js`)};`)
				.join(" ")
		);
		const result = rewrite(
			code,
			new Map(names.map((name) => [name, `./${name}.js`]))
		)!;
		expect(result.code).not.toContain('"./messages.js"');
		await fs.writeFile(path.join(root, "original.js"), code);
		await fs.writeFile(path.join(root, "rewritten.js"), result.code);
		const original = await import(
			pathToFileURL(path.join(root, "original.js")).href
		);
		const rewritten = await import(
			pathToFileURL(path.join(root, "rewritten.js")).href
		);
		return { original: original.output, rewritten: rewritten.output };
	} finally {
		await fs.rm(root, { recursive: true, force: true });
	}
}

test("object patterns and static template-literal keys read messages without the barrel", async () => {
	const { original, rewritten } = await runBoth(
		`import {m} from "./messages.js";
const {hello, "greeting.hello": greet = () => "unused"} = m;
let renamed;
({class: renamed} = m);
const read = ({hello: inner} = m) => inner();
export const output = [hello(), greet(), renamed(), read(), m[\`class\`]()];`,
		["hello", "greeting.hello", "class"]
	);
	expect(rewritten).toEqual(original);
	expect(original).toEqual([
		"hello",
		"greeting.hello",
		"class",
		"hello",
		"class",
	]);
});

test("a destructured __proto__ message reads the message twice", async () => {
	const { original, rewritten } = await runBoth(
		`import {m} from "./messages.js";
const {__proto__: first, __proto__: second} = m;
export const output = [first(), second()];`,
		["__proto__"]
	);
	expect(rewritten).toEqual(original);
	expect(original).toEqual(["__proto__", "__proto__"]);
});

test("a destructured __proto__ message does not depend on Object.prototype.__proto__", async () => {
	const { original, rewritten } = await runBoth(
		`import {m} from "./messages.js";
const accessor = Object.getOwnPropertyDescriptor(Object.prototype, "__proto__");
delete Object.prototype.__proto__;
let output;
try {
	const {__proto__: message} = m;
	output = typeof message;
} finally {
	Object.defineProperty(Object.prototype, "__proto__", accessor);
}
export {output};`,
		["__proto__"]
	);
	expect(rewritten).toEqual(original);
	expect(original).toBe("function");
});

test("compiled Vue templates read messages through unref without the barrel", () => {
	// @vitejs/plugin-vue's production output for `{{ m.hello() }}` in a
	// <script setup> component that imports `m`.
	const result = rewrite(
		'import { unref as _unref, toDisplayString as _toDisplayString } from "vue"; import { m } from "./messages.js"; export const render = () => [_toDisplayString(_unref(m).hello()), _unref(m)["greeting.hello"]()];'
	)!;
	expect(result.code).not.toContain("./messages.js");
	expect(result.code).toContain("_toDisplayString(__paraglide_message_0())");
});

test.each([
	'import {unref as _unref} from "vue"; function f(_unref){return _unref(m).hello()}',
	'import {unref as _unref} from "other"; _unref(m).hello()',
	'import {unref as _unref} from "vue"; use(_unref(m))',
	'import {unref as _unref} from "vue"; _unref?.(m).hello()',
	'import {unref as _unref} from "vue"; const alias=_unref; _unref(m).hello()',
])("an unverified unref keeps the barrel: %s", (code) => {
	expect(rewrite(`import {m} from './messages.js'; ${code};`)).toBeNull();
});

test("an unused namespace binding is retained when other named imports are optimized", () => {
	const result = rewrite("import {m,hello} from './messages.js'; hello();")!;
	expect(result.code).toContain('import { m } from "./messages.js"');
	expect(result.code).toContain('"virtual:test/hello.js"');
});

test("unrelated namespace imports and root export names are preserved", () => {
	expect(rewrite("import * as m from './messages.js';m.hello();")).toBeNull();
	expect(rewrite("import {m} from './other.js';m.hello();")).toBeNull();
	expect(rewrite("import {m} from './messages.js';m.missing();")).toBeNull();
});

test("directive prologues, hashbangs and non-ASCII offsets are preserved", () => {
	const code =
		'#!/usr/bin/env node\n"use client"; import {m} from "./messages.js"; const emoji="😀"; console.log(emoji,m.hello());';
	const result = rewrite(code)!;
	expect(result.code.startsWith('#!/usr/bin/env node\n"use client";')).toBe(
		true
	);
	expect(result.code).toContain('const emoji="😀"');
	expect(() => parseAst(result.code)).not.toThrow();
});

test("replacement imports retain evaluation order relative to side-effect imports", () => {
	const result = rewrite(
		'"use client"; import {hello} from "./messages.js"; import "./initialize.js"; hello();'
	)!;
	expect(result.code.indexOf('"virtual:test/hello.js"')).toBeLessThan(
		result.code.indexOf('"./initialize.js"')
	);
	expect(result.code.startsWith('"use client";')).toBe(true);
});

test("a following dependency observes the real generated runtime initialization", async () => {
	const root = await fs.realpath(
		await fs.mkdtemp(path.join(os.tmpdir(), "paraglide-import-order-"))
	);
	const scope = globalThis as typeof globalThis & { __paraglide?: unknown };
	const previous = scope.__paraglide;
	try {
		delete scope.__paraglide;
		await fs.writeFile(path.join(root, "package.json"), '{"type":"module"}');
		await fs.writeFile(
			path.join(root, "runtime.js"),
			createRuntimeFile({
				baseLocale: "en",
				locales: ["en"],
				compilerOptions: {
					...defaultCompilerOptions,
					strategy: ["baseLocale"],
				},
			})
		);
		await fs.writeFile(
			path.join(root, "leaf.js"),
			'import {getLocale} from "./runtime.js";export const hello=()=>getLocale();'
		);
		await fs.writeFile(
			path.join(root, "initialize.js"),
			'globalThis.__paraglide.custom="READY";'
		);
		const code =
			'import {hello} from "./messages.js";import "./initialize.js";export const value=hello();';
		const result = rewriteVirtualMessageImports({
			code,
			id: "app.js",
			ast: parseAst(code) as unknown as Program,
			imports: new Set(["./messages.js"]),
			messages: new Map([["hello", "./leaf.js"]]),
		})!;
		await fs.writeFile(path.join(root, "app.js"), result.code);
		expect(
			(await import(pathToFileURL(path.join(root, "app.js")).href)).value
		).toBe("en");
		expect(scope.__paraglide).toMatchObject({ custom: "READY" });
	} finally {
		if (previous === undefined) delete scope.__paraglide;
		else scope.__paraglide = previous;
		await fs.rm(root, { recursive: true, force: true });
	}
});
