import { beforeEach, expect, test, vi } from "vitest";
import { createProject as typescriptProject, ts } from "@ts-morph/bootstrap";
import {
	type BundleNested,
	insertBundleNested,
	loadProjectInMemory,
	newProject,
} from "@inlang/sdk";
import { createRequire } from "node:module";
import path from "node:path";
import { compileProject } from "./compile-project.js";

// TypeScript 7 (the Go-based compiler, npm `latest` since 7.0.2) no longer
// ships the in-process compiler API. Its main entry point only exports
// `version` and `versionMajorMinor` — no `createProgram`, no `ScriptTarget`,
// no `ModuleKind`. Emitting declarations must go through the `tsc` CLI
// instead. https://github.com/opral/paraglide-js/issues/711
//
// The repo's own `typescript` dev dependency stays on 5.x for the existing
// tests; this file swaps in the aliased TypeScript 7 package to simulate a
// user who upgraded.
//
// Note: vitest wraps factory mocks in a proxy that throws on missing exports.
// The real TypeScript 7 module returns `undefined` for them instead, so the
// classic compiler API surface is stubbed out explicitly to mirror that.
vi.mock("typescript", async () => {
	const actual =
		await vi.importActual<typeof import("typescript-go")>("typescript-go");
	return {
		...actual,
		createProgram: undefined,
		createCompilerHost: undefined,
		createSourceFile: undefined,
		ScriptTarget: undefined,
		ScriptKind: undefined,
		ModuleKind: undefined,
		ModuleResolutionKind: undefined,
	};
});

// In production, the `typescript` module and the `tsc` CLI resolve to the
// same package. In this test the module is mocked with the TypeScript 7
// alias, so the CLI resolution must point at that alias too — otherwise it
// would find the repo's TypeScript 5 dev dependency. Mutable so the error
// path can be tested with a broken resolution.
const tscResolution = vi.hoisted(() => ({ tscJsPath: "" }));

vi.mock("./resolve-tsc-js-path.js", () => ({
	resolveTscJsPath: () => tscResolution.tscJsPath,
}));

const typescriptGoTscJsPath = path.join(
	path.dirname(
		createRequire(import.meta.url).resolve("typescript-go/package.json")
	),
	"lib",
	"tsc.js"
);

beforeEach(() => {
	tscResolution.tscJsPath = typescriptGoTscJsPath;
});

async function newProjectWithMessages() {
	const project = await loadProjectInMemory({
		blob: await newProject({
			settings: {
				locales: ["en"],
				baseLocale: "en",
			},
		}),
	});

	// a message id that is not a valid JS identifier -> quoted export alias
	const quotedAliasBundle: BundleNested = {
		id: "greeting.hello",
		declarations: [],
		messages: [
			{
				id: "greeting.hello_en",
				bundleId: "greeting.hello",
				locale: "en",
				selectors: [],
				variants: [
					{
						id: "greeting.hello_en_variant",
						messageId: "greeting.hello",
						matches: [],
						pattern: [{ type: "text", value: "Hello" }],
					},
				],
			},
		],
	};

	// a message with an input so the declarations carry a typed parameter
	const parameterizedBundle: BundleNested = {
		id: "balance",
		declarations: [{ type: "input-variable", name: "amount" }],
		messages: [
			{
				id: "balance_en",
				bundleId: "balance",
				locale: "en",
				selectors: [],
				variants: [
					{
						id: "balance_en_variant",
						messageId: "balance",
						matches: [],
						pattern: [
							{ type: "text", value: "You have " },
							{
								type: "expression",
								arg: { type: "variable-reference", name: "amount" },
							},
							{ type: "text", value: " coins." },
						],
					},
				],
			},
		],
	};

	await insertBundleNested(project.db, quotedAliasBundle);
	await insertBundleNested(project.db, parameterizedBundle);
	return project;
}

test("emitTsDeclarations works with TypeScript 7 (tsgo)", async () => {
	const project = await newProjectWithMessages();

	for (const outputStructure of [
		"message-modules",
		"locale-modules",
	] as const) {
		const output = await compileProject({
			project,
			compilerOptions: {
				emitTsDeclarations: true,
				outputStructure,
				// path-traversing keys (incl. Windows separators) must be
				// silently skipped like on the compiler-API path — neither
				// escaping the temp dir nor failing the completeness check
				additionalFiles: {
					"../escape.js": "export const escape = 1;",
					"foo\\..\\..\\escape.js": "export const escape = 1;",
				},
			},
		});

		expect(output["../escape.d.ts"]).toBeUndefined();
		expect(output["foo\\..\\..\\escape.d.ts"]).toBeUndefined();

		expect(output).toHaveProperty("runtime.d.ts");
		expect(output).toHaveProperty("messages.d.ts");
		expect(output).toHaveProperty("registry.d.ts");
		expect(output["runtime.d.ts"]).toContain("getLocale");

		// TypeScript 5's declaration emitter drops the quotes around export
		// aliases that are not valid identifiers (worked around by a custom
		// transformer on the compiler-API path); tsgo emits them correctly.
		const declarationFile =
			outputStructure === "message-modules"
				? "messages/greeting_hello.d.ts"
				: "messages/_index.d.ts";

		expect(output[declarationFile]).toContain(`as "greeting.hello"`);

		// the emitted declarations must typecheck for a consumer
		// (@ts-morph/bootstrap bundles its own compiler and is unaffected
		// by the TypeScript 7 mock above)
		const tsProject = await typescriptProject({
			useInMemoryFileSystem: true,
			compilerOptions: {
				module: ts.ModuleKind.Node16,
				moduleResolution: ts.ModuleResolutionKind.Node16,
				strict: true,
			},
		});

		for (const [fileName, code] of Object.entries(output)) {
			if (fileName.endsWith(".d.ts")) {
				tsProject.createSourceFile(fileName, code);
			}
		}

		tsProject.createSourceFile(
			"test.ts",
			`
				import { "greeting.hello" as greetingHello, balance } from "./messages.js";

				greetingHello() satisfies string;
				balance({ amount: 5 }) satisfies string;
			`
		);

		const program = tsProject.createProgram();
		const diagnostics = ts.getPreEmitDiagnostics(program);
		for (const diagnostic of diagnostics) {
			console.error(diagnostic.messageText, diagnostic.file?.fileName);
		}
		expect(diagnostics.length).toEqual(0);
	}
});

test("emitTsDeclarations throws a descriptive error when the tsc CLI produces no declarations", async () => {
	tscResolution.tscJsPath = path.join(
		path.dirname(typescriptGoTscJsPath),
		"does-not-exist.js"
	);

	const project = await newProjectWithMessages();

	await expect(
		compileProject({
			project,
			compilerOptions: {
				emitTsDeclarations: true,
			},
		})
	).rejects.toThrow(/did not produce a declaration file for every compiled/);
});
