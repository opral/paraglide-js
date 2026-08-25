import { describe, expect, test } from "vitest";
import { resolveCompilerOptions } from "./resolve-compiler-options.js";

describe("resolveCompilerOptions", () => {
	test("throws when outdir is missing", () => {
		expect(() =>
			resolveCompilerOptions({
				config: undefined,
				overrides: { project: "/repo/app/project.inlang" },
			})
		).toThrow(/outdir.*required/i);
	});

	test("resolves relative paths against the supplied root", () => {
		const options = resolveCompilerOptions({
			config: { outdir: "./src/paraglide" },
			overrides: { project: "project.inlang" },
			root: "/repo/app",
		});
		expect(options.project).toBe("/repo/app/project.inlang");
		expect(options.outdir).toBe("/repo/app/src/paraglide");
	});

	test("config values override the defaults", () => {
		const options = resolveCompilerOptions({
			config: { outdir: "./from-config" },
			overrides: { project: "/base/project.inlang" },
			root: "/base",
		});
		expect(options.outdir).toBe("/base/from-config");
	});

	test("overrides win over config values", () => {
		const options = resolveCompilerOptions({
			config: { outdir: "./from-config" },
			overrides: { project: "/p", outdir: "/from-override" },
			root: "/base",
		});
		expect(options.outdir).toBe("/from-override");
	});

	test("explicit relative paths are resolved against the root", () => {
		const options = resolveCompilerOptions({
			config: { outdir: "./src/paraglide" },
			overrides: { project: "packages/app/project.inlang" },
			root: "/monorepo",
		});
		expect(options.project).toBe("/monorepo/packages/app/project.inlang");
	});

	test("undefined overrides do not shadow config values", () => {
		const options = resolveCompilerOptions({
			config: { strategy: ["url"], outdir: "/kept" },
			overrides: { strategy: undefined, project: "/p" },
		});
		expect(options.strategy).toEqual(["url"]);
		expect(options.outdir).toBe("/kept");
	});

	test("absolute paths from the config survive root resolution", () => {
		const options = resolveCompilerOptions({
			config: { outdir: "/abs/out" },
			overrides: { project: "/p" },
			root: "/base",
		});
		expect(options.outdir).toBe("/abs/out");
	});
});
