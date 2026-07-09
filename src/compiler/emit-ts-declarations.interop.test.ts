import { expect, test, vi } from "vitest";
import {
	type BundleNested,
	insertBundleNested,
	loadProjectInMemory,
	newProject,
} from "@inlang/sdk";
import { compileProject } from "./compile-project.js";

// Bundlers and CJS interop can deliver the `typescript` module in a
// default-only shape (`{ default: ts }` without hoisted named exports).
// TypeScript 5/6 in that shape must still be routed to the in-process
// compiler API: the CLI fallback intended for TypeScript 7+ would run
// TypeScript 5's `tsc`, whose declaration emitter produces syntactically
// invalid unquoted export aliases (`export { x as a.b }`).
//
// `createProgram: undefined` is stubbed explicitly because vitest wraps
// factory mocks in a proxy that throws on missing exports, while a real
// default-only namespace returns `undefined`.
vi.mock("typescript", async () => {
	const actual =
		await vi.importActual<typeof import("typescript")>("typescript");
	return {
		default: actual,
		createProgram: undefined,
	};
});

test("emitTsDeclarations uses the compiler API for a default-only interop shape of TypeScript 5", async () => {
	const project = await loadProjectInMemory({
		blob: await newProject({
			settings: {
				locales: ["en"],
				baseLocale: "en",
			},
		}),
	});

	const bundle: BundleNested = {
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
	await insertBundleNested(project.db, bundle);

	const output = await compileProject({
		project,
		compilerOptions: {
			emitTsDeclarations: true,
		},
	});

	expect(output).toHaveProperty("runtime.d.ts");
	// the quoted alias distinguishes the two paths: TypeScript 5's CLI would
	// emit the invalid `export { greeting_hello as greeting.hello }` instead
	expect(output["messages/greeting_hello.d.ts"]).toContain(
		`export { greeting_hello as "greeting.hello" };`
	);
});
