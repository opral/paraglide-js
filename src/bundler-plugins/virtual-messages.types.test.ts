import { test, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createRequire } from "node:module";
import ts from "typescript";
import { setImmediate as yieldToWorker } from "node:timers/promises";
import { compileCatalog } from "../compiler/compile-project.js";
import { virtualMessageOutput } from "./virtual-messages.js";

let root: string;
let typeRoots: string[];
beforeAll(async () => {
	root = await fs.realpath(
		await fs.mkdtemp(path.join(os.tmpdir(), "paraglide-virtual-types-"))
	);
	const outdir = path.join(root, "paraglide");
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
			bundles: [
				"hello",
				"m",
				"class",
				"default",
				"greeting.hello",
				"path",
				"rich",
			].map((id) => ({
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
	const { disk } = virtualMessageOutput(output, outdir);
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
