import { expect, test, vi } from "vitest";
import { loadProjectInMemory, newProject } from "@inlang/sdk";
import { createRequire } from "node:module";
import path from "node:path";
import { compileProject } from "./compile-project.js";

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

test("emitTsDeclarations uses the tsc of @typescript/native when it is installed", async () => {
	const project = await loadProjectInMemory({
		blob: await newProject({
			settings: {
				locales: ["en"],
				baseLocale: "en",
			},
		}),
	});

	const output = await compileProject({
		project,
		compilerOptions: {
			emitTsDeclarations: true,
		},
	});

	expect(output["runtime.d.ts"]).toContain("getLocale");
	expect(createProgram).not.toHaveBeenCalled();
});
