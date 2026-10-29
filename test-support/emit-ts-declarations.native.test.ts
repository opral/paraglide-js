import { beforeEach, expect, test, vi } from "vitest";
import { loadProjectInMemory, newProject } from "@inlang/sdk";
import { createRequire } from "node:module";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { compileProject } from "../src/compiler/compile-project.js";
import { emitTsDeclarations } from "./emit-ts-declarations.js";

// TypeScript 7 can be installed beside TypeScript 5/6 under the
// `@typescript/native` npm alias, the setup svelte-check documents for its
// `--tsgo` mode. Its `tsc` takes precedence over the in-process compiler API
// of the `typescript` package. The repo's TypeScript 7 alias stands in for it.
const nativeTsc = vi.hoisted(() => ({ tscJsPath: "" }));

vi.mock("./resolve-tsc-js-path.js", () => ({
	resolveNativeTscJsPath: () => nativeTsc.tscJsPath,
	resolveTscJsPath: () => {
		throw new Error("the tsc of the typescript package must not be used");
	},
}));

const createProgram = vi.hoisted(() => vi.fn());

vi.mock("typescript", async () => {
	const actual =
		await vi.importActual<typeof import("typescript")>("typescript");
	createProgram.mockImplementation(actual.createProgram);
	return { ...actual, createProgram };
});

nativeTsc.tscJsPath = path.join(
	path.dirname(
		createRequire(import.meta.url).resolve("typescript-go/package.json")
	),
	"lib",
	"tsc.js"
);

beforeEach(() => vi.clearAllMocks());

const nonJavaScriptOutput: (Record<string, string> | undefined)[] = [
	undefined,
	{},
	{ "notes.txt": "Additional documentation" },
];

test.each(nonJavaScriptOutput)(
	"emitTsDeclarations uses the tsc of @typescript/native with non-JavaScript output: %j",
	async (extraOutput) => {
		const project = await loadProjectInMemory({
			blob: await newProject({
				settings: {
					locales: ["en"],
					baseLocale: "en",
				},
			}),
		});

		const javascript = await compileProject({
			project,
			compilerOptions: {
				emitTsDeclarations: false,
			},
		});

		Object.assign(javascript, extraOutput);
		const output = await emitTsDeclarations(javascript);

		expect(output["runtime.d.ts"]).toContain("getLocale");
		expect(createProgram).not.toHaveBeenCalled();
	}
);

test.each(["custom.js", "messages.js"])(
	"the legacy emitter preserves imported types with @typescript/native installed: %s",
	async (fileName) => {
		const projectRoot = await fs.realpath(
			await fs.mkdtemp(path.join(os.tmpdir(), "paraglide-additional-types-"))
		);
		const dependency = path.join(
			projectRoot,
			"node_modules",
			"fixture-dependency"
		);
		await fs.mkdir(dependency, { recursive: true });
		await fs.writeFile(
			path.join(dependency, "package.json"),
			JSON.stringify({
				name: "fixture-dependency",
				version: "1.0.0",
				types: "index.d.ts",
			})
		);
		await fs.writeFile(
			path.join(dependency, "index.d.ts"),
			"export declare function value(): { id: number };"
		);
		const cwd = vi.spyOn(process, "cwd").mockReturnValue(projectRoot);

		try {
			const project = await loadProjectInMemory({
				blob: await newProject({
					settings: { locales: ["en"], baseLocale: "en" },
				}),
			});
			const javascript = await compileProject({
				project,
				compilerOptions: {
					emitTsDeclarations: false,
				},
			});

			javascript[fileName] =
				'import { value } from "fixture-dependency"; export const result = value();';

			const output = await emitTsDeclarations(javascript, {
				allowNativeAlias: false,
			});

			const declaration = output[fileName.replace(/\.js$/, ".d.ts")];
			expect(declaration).toMatch(/result:\s*\{\s*id: number;\s*\}/);
			expect(declaration).not.toMatch(/\bany\b/);
		} finally {
			cwd.mockRestore();
			await fs.rm(projectRoot, { recursive: true, force: true });
		}
	}
);
