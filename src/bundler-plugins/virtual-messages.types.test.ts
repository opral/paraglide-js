import { test, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createRequire } from "node:module";
import ts from "typescript";
import { setImmediate as yieldToWorker } from "node:timers/promises";
import { compileCatalog } from "../compiler/compile-project.js";
import { virtualMessageOutput } from "./virtual-messages.js";
import { toSafeModuleId } from "../compiler/safe-module-id.js";
import { toBundleInputTypeAliasName } from "../compiler/compile-bundle.js";
import { moduleIds } from "../compiler/output-structure/message-modules.js";
import type { BundleNested, Pattern } from "@inlang/sdk";

/** A bundle with one English message; its type checks the fixture's literals. */
function englishBundle(
	id: string,
	pattern: Pattern,
	inputs: string[] = []
): BundleNested {
	return {
		id,
		declarations: inputs.map((name) => ({ type: "input-variable", name })),
		messages: [
			{
				id: `${id}_en`,
				bundle_id: id,
				locale: "en",
				selectors: [],
				variants: [
					{ id: `${id}_en_v`, message_id: `${id}_en`, matches: [], pattern },
				],
			},
		],
	};
}
const icon: Pattern = [
	{ type: "markup-standalone", name: "icon", options: [], attributes: [] },
];
const nameInput: Pattern = [
	{ type: "expression", arg: { type: "variable-reference", name: "name" } },
];
const text = (value: string): Pattern => [{ type: "text", value }];

let root: string;
let typeRoots: string[];
beforeAll(async () => {
	root = await fs.realpath(
		await fs.mkdtemp(path.join(os.tmpdir(), "paraglide-virtual-types-"))
	);
	const outdir = path.join(root, "paraglide");
	const ids = [
		"hello",
		"m",
		"class",
		"default",
		"greeting.hello",
		"path",
		"rich",
	];
	const output = await compileCatalog({
		projectPath: path.join(root, "project.inlang"),
		compilerOptions: {
			emitTsDeclarations: true,
			emitReadme: false,
			emitGitIgnore: false,
			emitPrettierIgnore: false,
			includeEslintDisableComment: false,
		},
		catalog: {
			settings: { baseLocale: "en", locales: ["en", "de"], modules: [] },
			bundles: ids.map((id) => ({
				id,
				declarations: [
					{
						type: "input-variable" as const,
						name: id === "path" ? "path" : "name",
					},
				],
				messages: ["en", "de"].map((locale) => ({
					id: `${id}_${locale}`,
					bundle_id: id,
					locale,
					selectors:
						id === "path"
							? [{ type: "variable-reference" as const, name: "path" }]
							: [],
					variants: [
						{
							id: `${id}_${locale}_v`,
							message_id: `${id}_${locale}`,
							matches:
								id === "path"
									? [
											{
												type: "literal-match" as const,
												key: "path",
												value: "../runtime.js",
											},
										]
									: [],
							pattern: [
								...(id === "rich"
									? [
											{
												type: "markup-start" as const,
												name: "strong",
												options: [],
												attributes: [],
											},
										]
									: []),
								{
									type: "expression" as const,
									arg: {
										type: "variable-reference" as const,
										name: id === "path" ? "path" : "name",
									},
								},
								...(id === "rich"
									? [
											{
												type: "markup-end" as const,
												name: "strong",
												options: [],
												attributes: [],
											},
										]
									: []),
							],
						},
					],
				})),
			})),
		},
	});
	const { disk } = virtualMessageOutput(
		output,
		outdir,
		moduleIds(ids).get("default")
	);
	await fs.mkdir(outdir);
	for (const [name, code] of Object.entries(disk))
		await fs.writeFile(path.join(outdir, name), code);
	expect(Object.keys(disk)).toHaveLength(9);
	expect(
		Object.values(disk).every((code) => !/@ts-(?:ignore|nocheck)/.test(code))
	).toBe(true);
	await fs.writeFile(path.join(root, "package.json"), '{"type":"module"}');
	await fs.writeFile(
		path.join(root, "consumer.ts"),
		`
import {m,hello,"greeting.hello" as greeting} from './paraglide/messages.js';
import type {HelloInputs} from './paraglide/messages.js';
const inputs:m.HelloInputs={name:'Ada'};const named:HelloInputs=inputs;
hello(named,{locale:'de'});m.m(inputs);m.class(inputs);greeting(inputs);
m.path({path:'../runtime.js'});m.rich.parts(inputs);
// @ts-expect-error literal inputs must not change during runtime-import relocation
m.path({path:'./runtime.js'});
const legacyDefaultInputs:m._DefaultInputs=inputs;void legacyDefaultInputs;
// @ts-expect-error required inputs
m.hello();
// @ts-expect-error locale union
m.hello(inputs,{locale:'invalid'});
// @ts-expect-error unknown messages
m.missing();
// @ts-expect-error export-star barrels exclude default values
m.default(inputs);
// @ts-expect-error private quoted-export binding must remain private
m._class(inputs);
`
	);
	await fs.writeFile(
		path.join(root, "consumer.js"),
		"import {m} from './paraglide/messages.js';m.hello({name:'Ada'});\n// @ts-expect-error checked JS inputs\nm.hello();"
	);
	typeRoots = [
		path.dirname(
			path.dirname(
				createRequire(import.meta.url).resolve("@types/node/package.json")
			)
		),
	];
}, 30000);

afterAll(async () => {
	if (root) await fs.rm(root, { recursive: true, force: true });
});

const configurations: {
	module: string;
	moduleResolution: string;
	allowJs: boolean;
	checkJs: boolean;
	skipLibCheck: boolean;
	wholeOutput: boolean;
}[] = [];
for (const [module, moduleResolution] of [
	["Node16", "Node16"],
	["NodeNext", "NodeNext"],
	["ESNext", "Bundler"],
])
	for (const [allowJs, checkJs] of [
		[false, false],
		[true, false],
		[true, true],
	])
		for (const skipLibCheck of [false, true])
			for (const wholeOutput of [false, true])
				configurations.push({
					module: module!,
					moduleResolution: moduleResolution!,
					allowJs: allowJs!,
					checkJs: checkJs!,
					skipLibCheck,
					wholeOutput,
				});

test.each(configurations)(
	"virtual facade and declarations typecheck: %j",
	async ({
		module,
		moduleResolution,
		allowJs,
		checkJs,
		skipLibCheck,
		wholeOutput,
	}) => {
		// TS checking is synchronous. Let Vitest deliver worker RPC updates
		// between programs instead of starving them throughout the matrix.
		await yieldToWorker();
		const config = ts.parseJsonConfigFileContent(
			{
				compilerOptions: {
					module,
					moduleResolution,
					target: "ES2022",
					strict: true,
					noEmit: true,
					allowJs,
					checkJs,
					skipLibCheck,
					typeRoots,
					types: ["node"],
					noUnusedLocals: true,
					isolatedModules: true,
					verbatimModuleSyntax: true,
					noUncheckedSideEffectImports: true,
					noUncheckedIndexedAccess: true,
					exactOptionalPropertyTypes: true,
				},
				...(wholeOutput
					? {
							include: ["**/*.ts", "**/*.js"],
							...(allowJs ? { files: ["paraglide/messages.js"] } : {}),
						}
					: {
							files: allowJs ? ["consumer.ts", "consumer.js"] : ["consumer.ts"],
						}),
			},
			ts.sys,
			root
		);
		const diagnostics = [
			...config.errors,
			...ts.getPreEmitDiagnostics(
				ts.createProgram(config.fileNames, config.options)
			),
		];
		expect(
			diagnostics.map(
				(d) =>
					`${d.code}: ${ts.flattenDiagnosticMessageText(d.messageText, " ")}`
			),
			JSON.stringify({
				module,
				moduleResolution,
				allowJs,
				checkJs,
				skipLibCheck,
				wholeOutput,
			})
		).toEqual([]);
	},
	30000
);

test("the virtual declaration has a bounded number of import() types", async () => {
	const code = await fs.readFile(
		path.join(root, "paraglide", "messages.virtual.d.ts"),
		"utf8"
	);
	// LocalizedString and the shared runtime aliases, whatever the catalog size.
	expect(code.match(/import\(/g)).toHaveLength(4);
});

test("the virtual declaration declares what the message declarations do", async () => {
	const directory = await fs.realpath(
		await fs.mkdtemp(path.join(os.tmpdir(), "paraglide-virtual-contract-"))
	);
	try {
		const ids = Array.from({ length: 300 }, (_, index) =>
			index % 3 === 0 ? `group.item-${index}` : `item${index}`
		);
		const output = await compileCatalog({
			projectPath: path.join(directory, "project.inlang"),
			compilerOptions: { emitTsDeclarations: true, emitReadme: false },
			catalog: {
				settings: { baseLocale: "en", locales: ["en", "de"], modules: [] },
				bundles: ids.map((id, index) =>
					englishBundle(
						id,
						[
							...(index % 5 === 0 ? icon : []),
							...(index % 2 ? nameInput : text(id)),
						],
						index % 2 ? ["name"] : []
					)
				),
			},
		});
		const outdir = path.join(directory, "paraglide");
		const { disk } = virtualMessageOutput(output, outdir, undefined);
		// The per-message declarations the virtual file is built from, beside it.
		for (const [name, code] of [
			...Object.entries(disk),
			...Object.entries(output).filter(
				([name]) =>
					name.startsWith("messages/") &&
					name.endsWith(".d.ts") &&
					name !== "messages/_index.d.ts"
			),
		]) {
			await fs.mkdir(path.dirname(path.join(outdir, name)), {
				recursive: true,
			});
			await fs.writeFile(path.join(outdir, name), code);
		}
		const leaves = ids.map((id, index) => ({
			id,
			module: `leaf${index}`,
			file: `./paraglide/messages/${toSafeModuleId(id)}.js`,
			inputs: toBundleInputTypeAliasName(toSafeModuleId(id)),
		}));
		await fs.writeFile(
			path.join(directory, "consumer.ts"),
			[
				'import { m } from "./paraglide/messages.js";',
				...leaves.map(
					(leaf) =>
						`import * as ${leaf.module} from ${JSON.stringify(leaf.file)};`
				),
				"type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;",
				`export const names: Equal<keyof typeof m, ${leaves.map((leaf) => JSON.stringify(leaf.id)).join(" | ")}> = true;`,
				...leaves.flatMap((leaf) => [
					`export const value_${leaf.module}: Equal<(typeof m)[${JSON.stringify(leaf.id)}], (typeof ${leaf.module})[${JSON.stringify(leaf.id)}]> = true;`,
					`export const inputs_${leaf.module}: Equal<m.${leaf.inputs}, ${leaf.module}.${leaf.inputs}> = true;`,
				]),
			].join("\n")
		);
		expect(diagnosticsOf(path.join(directory, "consumer.ts"))).toEqual([]);
	} finally {
		await fs.rm(directory, { recursive: true, force: true });
	}
}, 30000);

test("the virtual declaration keeps the shared runtime aliases private", async () => {
	const directory = await fs.realpath(
		await fs.mkdtemp(path.join(os.tmpdir(), "paraglide-virtual-private-"))
	);
	try {
		// No message ID needs renaming, so no other export declaration hides them.
		const output = await compileCatalog({
			projectPath: path.join(directory, "project.inlang"),
			compilerOptions: { emitTsDeclarations: true, emitReadme: false },
			catalog: {
				settings: { baseLocale: "en", locales: ["en"], modules: [] },
				bundles: [
					englishBundle("plain", text("Plain")),
					englishBundle("rich", icon),
				],
			},
		});
		const outdir = path.join(directory, "paraglide");
		await fs.mkdir(outdir);
		for (const [name, code] of Object.entries(
			virtualMessageOutput(output, outdir, undefined).disk
		))
			await fs.writeFile(path.join(outdir, name), code);
		await fs.writeFile(
			path.join(directory, "consumer.ts"),
			[
				'import { m } from "./paraglide/messages.js";',
				"// @ts-expect-error the runtime aliases are private",
				'import type { __ParaglideMessageMetadata } from "./paraglide/messages.js";',
				"// @ts-expect-error the runtime aliases are private",
				'import type { __ParaglideMessagePart } from "./paraglide/messages.js";',
				"m.plain();",
				"m.rich.parts();",
			].join("\n")
		);
		expect(diagnosticsOf(path.join(directory, "consumer.ts"))).toEqual([]);
	} finally {
		await fs.rm(directory, { recursive: true, force: true });
	}
});

function diagnosticsOf(file: string) {
	const program = ts.createProgram([file], {
		strict: true,
		noEmit: true,
		target: ts.ScriptTarget.ES2022,
		module: ts.ModuleKind.ESNext,
		moduleResolution: ts.ModuleResolutionKind.Bundler,
		types: [],
	});
	return ts
		.getPreEmitDiagnostics(program)
		.map((diagnostic) =>
			ts.flattenDiagnosticMessageText(diagnostic.messageText, " ")
		);
}
