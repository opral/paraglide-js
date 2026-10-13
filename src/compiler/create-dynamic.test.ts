import { expect, test } from "vitest";
import {
	mkdtemp,
	mkdir,
	writeFile,
	readFile,
	readdir,
	rm,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createProject, ts } from "@ts-morph/bootstrap";
import {
	insertBundleNested,
	loadProjectInMemory,
	newProject,
	type BundleNested,
} from "@inlang/sdk";
import { compileProject } from "./compile-project.js";

async function fixture(emitTsDeclarations = false) {
	const project = await loadProjectInMemory({
		blob: await newProject({
			settings: { baseLocale: "en", locales: ["en", "de"] },
		}),
	});
	const ids = [
		"greeting",
		"then",
		"foo_bar",
		"HelloWorld",
		"user.profile",
		"__proto__",
		"slash/key",
		"quote'key",
		"emoji_🍌",
		"9Lives",
		"await",
	];
	ids.push(
		...Array.from({ length: 80 }, (_, i) => `zz_${String(i).padStart(3, "0")}`)
	);
	for (const id of ids) {
		const bundle: BundleNested = {
			id,
			declarations:
				id === "greeting" ? [{ type: "input-variable", name: "name" }] : [],
			messages: ["en", "de"].map((locale) => ({
				id: id + locale,
				bundle_id: id,
				locale,
				selectors: [],
				variants: [
					{
						id: id + locale + "variant",
						message_id: id + locale,
						matches: [],
						pattern:
							id === "greeting"
								? [
										{ type: "text", value: locale + ":" },
										{
											type: "expression",
											arg: { type: "variable-reference", name: "name" },
										},
									]
								: [{ type: "text", value: locale + ":" + id }],
					},
				],
			})),
		};
		await insertBundleNested(project.db, bundle);
	}
	await insertBundleNested(project.db, {
		id: "fallback",
		declarations: [],
		messages: [
			{
				id: "fallback_en",
				bundle_id: "fallback",
				locale: "en",
				selectors: [],
				variants: [
					{
						id: "fallback_variant",
						message_id: "fallback_en",
						matches: [],
						pattern: [{ type: "text", value: "fallback text" }],
					},
				],
			},
		],
	});
	for (const id of ["formatted", "registry"])
		await insertBundleNested(project.db, {
			id,
			declarations: [{ type: "input-variable", name: "value" }],
			messages: ["en", "de"].map((locale) => ({
				id: id + "_" + locale,
				bundle_id: id,
				locale,
				selectors: [],
				variants: [
					{
						id: id + "_variant_" + locale,
						message_id: id + "_" + locale,
						matches: [],
						pattern: [
							{
								type: "expression",
								arg: { type: "variable-reference", name: "value" },
								annotation: {
									type: "function-reference",
									name: "number",
									options: [],
								},
							},
						],
					},
				],
			})),
		});

	try {
		return await compileProject({
			project,
			compilerOptions: {
				emitTsDeclarations,
				strategy: ["globalVariable", "baseLocale"],
			},
		});
	} finally {
		await project.close();
	}
}

async function onDisk(output: Record<string, string>) {
	const root = await mkdtemp(join(tmpdir(), "paraglide-dynamic-"));
	for (const [file, text] of Object.entries({
		...output,
		"package.json": '{"type":"module"}',
	})) {
		const filename = join(root, file);
		await mkdir(dirname(filename), { recursive: true });
		await writeFile(filename, text);
	}
	return root;
}

// Run generated files in Node itself; Vitest's module runner can hide ESM behavior.
async function runNative(root: string, script: string) {
	await promisify(execFile)(
		process.execPath,
		["--input-type=module", "--eval", script],
		{ cwd: root, timeout: 10000 }
	);
}

test("native lookup loads only the requested group and captures locale", async () => {
	const output = await fixture();
	expect(
		Object.keys(output).filter(
			(file) => file.startsWith("messages/") && file.endsWith(".js")
		)
	).toHaveLength(3);
	expect(output).not.toHaveProperty("messages/greeting.js");
	output["messages/group-001.js"] =
		"throw new Error('unrelated group evaluated')";
	output["messages/group-000.js"] =
		"globalThis.messageEvaluations = (globalThis.messageEvaluations ?? 0) + 1;\n" +
		output["messages/group-000.js"];

	const root = await onDisk(output);
	try {
		await runNative(
			root,
			`
   import assert from 'node:assert/strict';
   import {getMessage, MessageLoadError} from './dynamic.js';
   import {setLocale, overwriteServerAsyncLocalStorage} from './runtime.js';
   import {AsyncLocalStorage} from 'node:async_hooks';
   setLocale('en', {reload:false});
   const pending = getMessage('greeting', {name:'Ada'});
   setLocale('de', {reload:false});
   assert.equal(await pending, 'en:Ada');
   assert.equal(await getMessage('greeting', {name:'Bea'}, {locale:'de'}), 'de:Bea');
   assert.equal(globalThis.messageEvaluations, 1);
   assert.equal(await getMessage('fallback', {}, {locale:'de'}), 'fallback text');
   assert.equal(await getMessage('formatted', {value:1234.5}, {locale:'de'}), new Intl.NumberFormat('de').format(1234.5));
   await assert.rejects(getMessage('formatted', {value:Symbol()}, {locale:'en'}), TypeError);
   const storage = new AsyncLocalStorage();
   overwriteServerAsyncLocalStorage(storage);
   const results = await Promise.all(['en','de'].map(locale => storage.run({locale}, () => getMessage('greeting', {name:locale}))));
   assert.deepEqual(results, ['en:en','de:de']);
   overwriteServerAsyncLocalStorage(undefined);
   for (const key of ${JSON.stringify(["then", "HelloWorld", "user.profile", "__proto__", "slash/key", "quote'key", "emoji_🍌", "9Lives", "await"])}) {
    assert.equal(await getMessage(key, {}, {locale:'en'}), 'en:' + key);
   }
   await assert.rejects(getMessage('missing', {}, {locale:'en'}), error => error instanceof MessageLoadError && error.key === 'missing' && error.locale === 'en' && error.cause instanceof Error);
   await assert.rejects(getMessage('greeting', {name:'Ada'}, {locale:'xx'}), /Invalid locale/);
  `
		);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("normalized unknown key cannot call a neighboring export; then keeps its barrel API", async () => {
	const root = await onDisk(await fixture());
	try {
		await runNative(
			root,
			`
   import assert from 'node:assert/strict';
   import {getMessage, MessageLoadError} from './dynamic.js';
   import {m} from './messages.js';
   await assert.rejects(getMessage('foo-bar', {}, {locale:'en'}), MessageLoadError);
   await assert.rejects(getMessage('_then', {}, {locale:'en'}), MessageLoadError);
   assert.equal(await getMessage('zz_079', {}, {locale:'de'}), 'de:zz_079');
   assert.equal(await getMessage('registry', {value:1234}, {locale:'de'}), new Intl.NumberFormat('de').format(1234));
   assert.equal(m.registry({value:1234}, {locale:'de'}), new Intl.NumberFormat('de').format(1234));
   assert.equal(m.then({}, {locale:'de'}), 'de:then');
   assert.equal(Object.hasOwn(m, '_then'), false);
  `
		);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

for (const declarations of [false, true]) {
	test(`generated lookup types check keys and inputs (declarations: ${declarations})`, async () => {
		const output = await fixture(declarations);
		const project = await createProject({
			useInMemoryFileSystem: true,
			compilerOptions: {
				strict: true,
				noUncheckedIndexedAccess: true,
				allowJs: true,
				checkJs: true,
				noEmit: true,
				target: ts.ScriptTarget.ES2022,
				module: ts.ModuleKind.ESNext,
				moduleResolution: ts.ModuleResolutionKind.Bundler,
			},
		});
		for (const [file, text] of Object.entries(output))
			if (/\.(js|ts)$/.test(file))
				project.createSourceFile("/generated/" + file, text);
		project.createSourceFile(
			"/generated/usage.ts",
			`
import {getMessage} from './dynamic.js';
import type {LocalizedString} from './runtime.js';
const translated: Promise<LocalizedString> = getMessage('greeting', {name:'Ada'}, {locale:'de'});
getMessage('then');
getMessage('then', {}, {locale:'de'});
const key: string = JSON.parse('"greeting"');
getMessage(key, {name:'Ada'});
// @ts-expect-error unknown literal
getMessage('missing');
// @ts-expect-error required input
getMessage('greeting');
// @ts-expect-error wrong input name
getMessage('greeting', {wrong:'Ada'});
// @ts-expect-error wrong input type
getMessage('greeting', {name:null});
// @ts-expect-error options belong in argument three
getMessage('then', {locale:'de'});
// @ts-expect-error invalid locale
getMessage('then', {}, {locale:'xx'});
const union: 'greeting' | 'then' = Math.random() > .5 ? 'greeting' : 'then';
// @ts-expect-error uncorrelated key and inputs
getMessage(union, {});
const correlated: ['greeting', {name:string}] | ['then'] = Math.random() > .5 ? ['greeting',{name:'Ada'}] : ['then'];
getMessage(...correlated);
void translated;
`
		);
		const diagnostics = ts
			.getPreEmitDiagnostics(project.createProgram())
			.filter(
				(d) =>
					!ts
						.flattenDiagnosticMessageText(d.messageText, "\n")
						.includes("Cannot find module 'async_hooks'")
			);
		expect(
			diagnostics.map((d) =>
				ts.flattenDiagnosticMessageText(d.messageText, "\n")
			)
		).toEqual([]);
	});
}

test("message-modules reject normalized filename collisions", async () => {
	const project = await loadProjectInMemory({
		blob: await newProject({ settings: { baseLocale: "en", locales: ["en"] } }),
	});
	try {
		for (const id of ["then", "_then"])
			await insertBundleNested(project.db, {
				id,
				declarations: [],
				messages: [],
			});
		await expect(
			compileProject({
				project,
				compilerOptions: { outputStructure: "message-modules" },
			})
		).rejects.toThrow("map to the same module filename");
		const output = await compileProject({
			project,
			compilerOptions: { outputStructure: "locale-modules" },
		});
		expect(output).not.toHaveProperty("dynamic.js");
		expect(output["README.md"]).not.toContain("On-demand messages");
	} finally {
		await project.close();
	}
});

test("message-modules reject the reserved catalog filename", async () => {
	const project = await loadProjectInMemory({
		blob: await newProject({ settings: { baseLocale: "en", locales: ["en"] } }),
	});
	try {
		await insertBundleNested(project.db, {
			id: "_index",
			declarations: [],
			messages: [],
		});
		await expect(
			compileProject({
				project,
				compilerOptions: { outputStructure: "message-modules" },
			})
		).rejects.toThrow("reserved module filename: _index.js");
	} finally {
		await project.close();
	}
});

test("grouped defaults support IDs that collide in individual filenames", async () => {
	const project = await loadProjectInMemory({
		blob: await newProject({ settings: { baseLocale: "en", locales: ["en"] } }),
	});
	try {
		for (const id of [
			"then",
			"_then",
			"_index",
			"foo_bar",
			"foo-bar",
			"foo__bar",
			"_message0",
			"messages",
			"getLocale",
			"experimentalStaticLocale",
		])
			await insertBundleNested(project.db, {
				id,
				declarations: [],
				messages: [],
			});
		const root = await onDisk(await compileProject({ project }));
		try {
			await runNative(
				root,
				`import assert from 'node:assert/strict'; import {getMessage} from './dynamic.js'; import {m} from './messages.js';
   for(const key of ['then','_then','_index','foo_bar','foo-bar','foo__bar','_message0','messages','getLocale','experimentalStaticLocale']) {assert.equal(await getMessage(key), key);assert.equal(m[key](),key);}
   await assert.rejects(getMessage('_message1'));`
			);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	} finally {
		await project.close();
	}
});

test("static imports tree-shake other functions from the same group", async () => {
	const { rolldown } = await import("rolldown");
	const output = await fixture();
	const root = await onDisk(output);
	await writeFile(
		join(root, "entry.js"),
		"export { greeting } from './messages.js';"
	);
	const graph = await rolldown({ input: join(root, "entry.js") });
	try {
		const result = await graph.generate({ format: "esm" });
		const code = result.output
			.filter((file) => file.type === "chunk")
			.map((file) => file.code)
			.join("\n");
		expect(code).toContain("greeting");
		expect(code).not.toContain("en:foo_bar");
		expect(code).not.toContain("en:then");
		expect(code).not.toContain("zz_079");
	} finally {
		await graph.close();
		await rm(root, { recursive: true, force: true });
	}
});

test("group source budgets split large messages without individual leaf files", async () => {
	const project = await loadProjectInMemory({
		blob: await newProject({ settings: { baseLocale: "en", locales: ["en"] } }),
	});
	try {
		for (const id of ["large_a", "large_b"])
			await insertBundleNested(project.db, {
				id,
				declarations: [],
				messages: [
					{
						id: id + "_en",
						bundle_id: id,
						locale: "en",
						selectors: [],
						variants: [
							{
								id: id + "_variant",
								message_id: id + "_en",
								matches: [],
								pattern: [{ type: "text", value: "X".repeat(70000) }],
							},
						],
					},
				],
			});
		const output = await compileProject({ project });
		expect(
			Object.keys(output).filter((file) =>
				/messages\/group-\d+\.js$/.test(file)
			)
		).toHaveLength(2);
		expect(output).not.toHaveProperty("messages/large_a.js");
		const root = await onDisk(output);
		try {
			await runNative(
				root,
				`import assert from 'node:assert/strict';import{getMessage}from'./dynamic.js';assert.equal((await getMessage('large_a')).length,70000);assert.equal((await getMessage('large_b')).length,70000);`
			);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	} finally {
		await project.close();
	}
});

test("Vite production output keeps groups lazy and resolves runtime keys", async () => {
	const { build } = await import("vite");
	const root = await onDisk(await fixture());
	try {
		await writeFile(
			join(root, "entry.js"),
			"export { getMessage } from './dynamic.js';"
		);
		await build({
			root,
			configFile: false,
			logLevel: "silent",
			build: {
				lib: {
					entry: join(root, "entry.js"),
					formats: ["es"],
					fileName: "entry",
				},
				outDir: "bundled",
				minify: false,
			},
		});
		const dir = join(root, "bundled");
		const entry = await readFile(join(dir, "entry.js"), "utf8");
		expect(entry).not.toContain("en:greeting");
		expect(entry).not.toContain("zz_079");
		const chunks = await Promise.all(
			(await readdir(dir))
				.filter((file) => file.startsWith("group-"))
				.map(async (file) => ({
					file,
					code: await readFile(join(dir, file), "utf8"),
				}))
		);
		expect(chunks).toHaveLength(2);
		const last = chunks.find((chunk) => chunk.code.includes("zz_079"))!;
		await writeFile(
			join(dir, last.file),
			last.code + "\nthrow new Error('unrequested group loaded');"
		);
		await runNative(
			root,
			`import assert from 'node:assert/strict'; import {getMessage} from './bundled/entry.js'; const key = process.env.TEST_KEY || 'greeting'; assert.equal(await getMessage(key, {name:'Ada'}, {locale:'de'}), 'de:Ada');`
		);
		await writeFile(join(dir, last.file), last.code);
		await runNative(
			root,
			`import assert from 'node:assert/strict'; import {getMessage} from './bundled/entry.js'; for(const key of ['greeting','zz_079']) assert.equal(await getMessage(key, {name:'Ada'}, {locale:'de'}), key === 'greeting' ? 'de:Ada' : 'de:zz_079');`
		);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});
