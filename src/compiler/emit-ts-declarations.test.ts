import { expect, test } from "vitest";
import {
	insertBundleNested,
	loadProjectInMemory,
	newProject,
	type BundleNested,
	type Declaration,
	type Match,
	type Pattern,
	type VariableReference,
} from "@inlang/sdk";
import ts from "typescript";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { compileProject } from "./compile-project.js";
import type { CompilerOptions } from "./compiler-options.js";

const execFileAsync = promisify(execFile);
// Keep the reference compiler outside src/dist. A variable import also prevents
// the production tsconfig from pulling development tooling into its rootDir.
const referenceUrl = new URL(
	"../../test-support/emit-ts-declarations.ts",
	import.meta.url
).href;
const referenceEmitter = (await import(referenceUrl)).emitTsDeclarations as (
	output: Record<string, string>,
	options?: { allowNativeAlias?: boolean }
) => Promise<Record<string, string>>;

function bundle(args: {
	id: string;
	declarations?: Declaration[];
	variants?: { matches?: Match[]; pattern: Pattern }[];
	pattern?: Pattern;
	selectors?: VariableReference[];
}): BundleNested {
	return {
		id: args.id,
		declarations: args.declarations ?? [],
		messages: [
			{
				id: `${args.id}_en`,
				bundle_id: args.id,
				locale: "en",
				selectors: args.selectors ?? [],
				variants: (
					args.variants ?? [
						{ pattern: args.pattern ?? [{ type: "text", value: "Hello" }] },
					]
				).map((variant, index) => ({
					id: `${args.id}_en_${index}`,
					message_id: `${args.id}_en`,
					matches: variant.matches ?? [],
					pattern: variant.pattern,
				})),
			},
		],
	};
}

async function fixture() {
	const project = await loadProjectInMemory({
		blob: await newProject({
			settings: {
				baseLocale: "en",
				locales: ["en", "de", "de-CH"],
			},
		}),
	});
	for (const value of [
		bundle({ id: "plain" }),
		bundle({ id: "greeting.hello" }),
		bundle({ id: "default" }),
		bundle({ id: "class" }),
		bundle({
			id: "unusual",
			declarations: [{ type: "input-variable", name: "user-name" }],
			pattern: [
				{
					type: "expression",
					arg: { type: "variable-reference", name: "user-name" },
				},
			],
		}),
		bundle({
			id: "numeric",
			declarations: [{ type: "input-variable", name: "value" }],
			variants: ["1", "2"].map((value) => ({
				matches: [{ type: "literal-match", key: "value", value }],
				pattern: [{ type: "text", value }],
			})),
		}),
		bundle({
			id: "welcome",
			declarations: [{ type: "input-variable", name: "username" }],
			pattern: [
				{
					type: "expression",
					arg: { type: "variable-reference", name: "username" },
				},
			],
		}),
		bundle({
			id: "status",
			declarations: [{ type: "input-variable", name: "state" }],
			variants: ["ready", "busy"].map((value) => ({
				matches: [{ type: "literal-match", key: "state", value }],
				pattern: [{ type: "text", value }],
			})),
		}),
		bundle({
			id: "count",
			declarations: [{ type: "input-variable", name: "count" }],
			variants: [
				{
					matches: [{ type: "literal-match", key: "count", value: "1" }],
					pattern: [{ type: "text", value: "One" }],
				},
				{
					matches: [{ type: "catchall-match", key: "count" }],
					pattern: [
						{
							type: "expression",
							arg: { type: "variable-reference", name: "count" },
						},
					],
				},
			],
		}),
		bundle({
			id: "plural",
			declarations: [
				{ type: "input-variable", name: "count" },
				{
					type: "local-variable",
					name: "countPlural",
					value: {
						type: "expression",
						arg: { type: "variable-reference", name: "count" },
						annotation: {
							type: "function-reference",
							name: "plural",
							options: [],
						},
					},
				},
			],
			selectors: [{ type: "variable-reference", name: "countPlural" }],
			variants: ["one", "other"].map((value) => ({
				matches: [{ type: "literal-match", key: "countPlural", value }],
				pattern: [{ type: "text", value }],
			})),
		}),
		bundle({
			id: "rich",
			declarations: [{ type: "input-variable", name: "amount" }],
			pattern: [
				{ type: "markup-start", name: "strong", options: [], attributes: [] },
				{
					type: "expression",
					arg: { type: "variable-reference", name: "amount" },
				},
				{ type: "markup-end", name: "strong", options: [], attributes: [] },
			],
		}),
	])
		await insertBundleNested(project.db, value);
	return project;
}

/** Normalize formatting/comments through the TS5 AST, leaving the type contract. */
function normalizeDeclarations(output: Record<string, string>) {
	const printer = ts.createPrinter({ removeComments: true });
	return Object.fromEntries(
		Object.entries(output)
			.filter(([name]) => name.endsWith(".d.ts"))
			.sort(([a], [b]) => a.localeCompare(b))
			.map(([name, source]) => {
				const parsed = ts.createSourceFile(
					name,
					source,
					ts.ScriptTarget.Latest,
					true,
					ts.ScriptKind.TS
				);
				const transformed = ts.transform(parsed, [
					(context) => {
						const visit: ts.Visitor = (node) => {
							if (node.kind === ts.SyntaxKind.DeclareKeyword) return undefined;
							if (ts.isStringLiteral(node))
								return ts.factory.createStringLiteral(node.text);
							return ts.visitEachChild(node, visit, context);
						};
						return (file) => ts.visitNode(file, visit) as ts.SourceFile;
					},
				]);
				try {
					return [
						name,
						transformed.transformed[0]!.statements.flatMap((statement) => {
							if (
								ts.isExportDeclaration(statement) &&
								statement.exportClause &&
								ts.isNamedExports(statement.exportClause)
							) {
								return statement.exportClause.elements.map((element) =>
									ts.factory.updateExportDeclaration(
										statement,
										statement.modifiers,
										statement.isTypeOnly,
										ts.factory.createNamedExports([element]),
										statement.moduleSpecifier,
										statement.attributes
									)
								);
							}
							return [statement];
						})
							.map((statement) =>
								printer.printNode(
									ts.EmitHint.Unspecified,
									statement,
									transformed.transformed[0]!
								)
							)
							.sort()
							.join("\n"),
					];
				} finally {
					transformed.dispose();
				}
			})
	);
}

const consumer = `
import { m, "greeting.hello" as unsafeGreeting, "class" as reserved } from "./messages.js";
import { getLocale, setLocale, locales, type Locale, type MessagePart } from "./runtime.js";
import { paraglideMiddleware } from "./server.js";
const locale: Locale = "de-CH";
locales satisfies readonly Locale[];
getLocale() satisfies Locale;
setLocale(locale);
unsafeGreeting() satisfies string;
reserved() satisfies string;
m.plain() satisfies string;
m.plain({}, { locale: "de-CH" }) satisfies string;
m.welcome({ username: "Ada" }, { locale: "de" }) satisfies string;
m.status({ state: "ready" });
m.count({ count: 4 });
m.plural({ count: 2 });
m.unusual({ "user-name": "Ada" });
m.numeric({ value: 1 });
m.numeric({ value: "2" });
m.rich.parts({ amount: 4 }) satisfies MessagePart[];
paraglideMiddleware(new Request("https://example.com"), () => new Response());
// @ts-expect-error missing required inputs
m.welcome();
// @ts-expect-error missing required input property
m.welcome({});
// @ts-expect-error locale is outside the configured union
m.plain({}, { locale: "fr" });
// @ts-expect-error closed match literal union
m.status({ state: "unknown" });
// @ts-expect-error plural input is required
m.plural({});
// @ts-expect-error number outside the closed match union
m.numeric({ value: 3 });
// @ts-expect-error input name typo
m.welcome({ user: "Ada" });
// @ts-expect-error message does not exist
m.missing();
// @ts-expect-error invalid locale for runtime setter
setLocale("fr");
// @ts-expect-error markup function inputs are required
m.rich.parts();
`;

async function checkConsumer(
	output: Record<string, string>,
	compiler: "typescript" | "typescript-go"
) {
	const directory = await fs.mkdtemp(
		path.join(os.tmpdir(), "paraglide-consumer-")
	);
	try {
		for (const [name, source] of Object.entries(output)) {
			if (!name.endsWith(".d.ts")) continue;
			await fs.mkdir(path.dirname(path.join(directory, name)), {
				recursive: true,
			});
			await fs.writeFile(path.join(directory, name), source);
		}
		await fs.writeFile(
			path.join(directory, "package.json"),
			'{"type":"module"}'
		);
		await fs.writeFile(path.join(directory, "consumer.ts"), consumer);
		await fs.writeFile(
			path.join(directory, "tsconfig.json"),
			JSON.stringify({
				compilerOptions: {
					strict: true,
					noEmit: true,
					target: "ES2022",
					module: "NodeNext",
					moduleResolution: "NodeNext",
					lib: ["ESNext", "DOM"],
					skipLibCheck: false,
					types: [],
					noErrorTruncation: true,
				},
				files: ["consumer.ts"],
			})
		);
		const compilerPath = path.join(
			path.dirname(
				createRequire(import.meta.url).resolve(`${compiler}/package.json`)
			),
			"lib",
			"tsc.js"
		);
		try {
			await execFileAsync(
				process.execPath,
				[compilerPath, "-p", path.join(directory, "tsconfig.json")],
				{
					env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
					maxBuffer: 1024 * 1024,
				}
			);
		} catch (error) {
			throw new Error(
				`${compiler} consumer failed:\n${(error as { stdout?: string }).stdout ?? error}`,
				{ cause: error }
			);
		}
	} finally {
		await fs.rm(directory, { recursive: true, force: true });
	}
}

for (const outputStructure of ["message-modules", "locale-modules"] as const) {
	test(`${outputStructure}: direct declarations preserve the TypeScript 5 contract`, async () => {
		const project = await fixture();
		try {
			const javascript = await compileProject({
				project,
				compilerOptions: { outputStructure },
			});
			const reference = normalizeDeclarations(
				await referenceEmitter(javascript, { allowNativeAlias: false })
			);
			// Pin the reference independently of the direct implementation.
			expect(
				Object.fromEntries(
					Object.entries(reference).filter(([name]) =>
						name.startsWith("messages")
					)
				)
			).toMatchSnapshot();
			const direct = await compileProject({
				project,
				compilerOptions: { outputStructure, emitTsDeclarations: true },
			});
			expect(normalizeDeclarations(direct)).toEqual(reference);
		} finally {
			await project.close();
		}
	});

	for (const compiler of ["typescript", "typescript-go"] as const) {
		test(`${outputStructure}: ${compiler} accepts valid consumers and rejects invalid calls`, async () => {
			const project = await fixture();
			try {
				const output = await compileProject({
					project,
					compilerOptions: { outputStructure, emitTsDeclarations: true },
				});
				await checkConsumer(output, compiler);
			} finally {
				await project.close();
			}
		});
	}
}

for (const extraOptions of [
	{ experimentalStaticLocale: '"de"' },
	{ disableAsyncLocalStorage: true },
] satisfies Partial<CompilerOptions>[]) {
	test(`declarations remain valid with ${Object.keys(extraOptions)[0]}`, async () => {
		const project = await fixture();
		try {
			const output = await compileProject({
				project,
				compilerOptions: { ...extraOptions, emitTsDeclarations: true },
			});
			await checkConsumer(output, "typescript");
		} finally {
			await project.close();
		}
	});
}

for (const name of ["custom.js", "runtime.js", "messages/_index.js"]) {
	test(`additional JavaScript ${name} requires companion declarations`, async () => {
		const project = await fixture();
		try {
			await expect(
				compileProject({
					project,
					compilerOptions: {
						emitTsDeclarations: true,
						additionalFiles: { [name]: "export const custom = 1;" },
					},
				})
			).rejects.toThrow(name.replace(/\.js$/, ".d.ts"));
		} finally {
			await project.close();
		}
	});
}

test("custom and overridden modules preserve explicitly supplied declarations", async () => {
	const project = await fixture();
	const additionalFiles = {
		"custom.js": "export const custom = 1;",
		"custom.d.ts": "export declare const custom: 1;",
		"registry.js": "export const replacement = true;",
		"registry.d.ts": "export declare const replacement: true;",
		"types-only.d.ts": "export type ApplicationType = string;",
	};
	try {
		const output = await compileProject({
			project,
			compilerOptions: {
				emitTsDeclarations: true,
				additionalFiles,
				includeEslintDisableComment: false,
			},
		});
		for (const [name, source] of Object.entries(additionalFiles))
			expect(output[name]).toBe(source);
	} finally {
		await project.close();
	}
});

test("custom JavaScript remains accepted without declarations when declaration emission is off", async () => {
	const project = await fixture();
	try {
		const output = await compileProject({
			project,
			compilerOptions: {
				additionalFiles: { "custom.js": "export const custom = 1;" },
				includeEslintDisableComment: false,
			},
		});
		expect(output["custom.js"]).toBe("export const custom = 1;");
		expect(output["custom.d.ts"]).toBeUndefined();
	} finally {
		await project.close();
	}
});

for (const outputStructure of ["message-modules", "locale-modules"] as const) {
	test(`${outputStructure}: empty projects emit valid empty message modules`, async () => {
		const project = await loadProjectInMemory({
			blob: await newProject({
				settings: { baseLocale: "en", locales: ["en"] },
			}),
		});
		try {
			const javascript = await compileProject({
				project,
				compilerOptions: { outputStructure },
			});
			const reference = normalizeDeclarations(
				await referenceEmitter(javascript, { allowNativeAlias: false })
			);
			const direct = await compileProject({
				project,
				compilerOptions: { outputStructure, emitTsDeclarations: true },
			});
			expect(normalizeDeclarations(direct)).toEqual(reference);
		} finally {
			await project.close();
		}
	});
}
