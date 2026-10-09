import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { memfs } from "memfs";
import { addInlangCheck } from "./add-inlang-check.js";
import { Logger } from "../../services/logger/index.js";

const originalCwd = process.cwd;
beforeEach(() => {
	process.cwd = (() => "/") as typeof process.cwd;
});
afterEach(() => {
	process.cwd = originalCwd;
});

async function runAddInlangCheck(packageJson: Record<string, unknown>) {
	const fs = memfs({ "/package.json": JSON.stringify(packageJson, null, 2) })
		.fs as unknown as typeof import("node:fs");
	const logger = new Logger({ silent: true, prefix: false });
	const success = vi.spyOn(logger, "success");
	const warn = vi.spyOn(logger, "warn");
	await addInlangCheck({
		fs: fs.promises,
		logger,
		projectPath: "./project.inlang",
		root: "/",
		packageJsonPath: "/package.json",
	});
	return {
		pkg: JSON.parse(await fs.promises.readFile("/package.json", "utf-8")),
		logged: success.mock.calls.map(([message]) => message),
		warned: warn.mock.calls.map(([message]) => String(message)),
	};
}

test("adds @inlang/cli and a check:i18n script", async () => {
	const { pkg, logged, warned } = await runAddInlangCheck({
		scripts: { build: "vite build" },
		devDependencies: { vite: "^6.0.0" },
	});

	expect(pkg.devDependencies).toEqual({
		vite: "^6.0.0",
		"@inlang/cli": "^3.4.0",
	});
	expect(pkg.scripts).toEqual({
		build: "vite build",
		"check:i18n": "inlang check --project ./project.inlang",
	});
	expect(logged).toHaveLength(2);
	expect(warned).toEqual([]);
});

test("adds devDependencies and scripts to a package.json without them", async () => {
	const { pkg } = await runAddInlangCheck({ name: "app" });

	expect(pkg.devDependencies).toEqual({ "@inlang/cli": "^3.4.0" });
	expect(pkg.scripts).toEqual({
		"check:i18n": "inlang check --project ./project.inlang",
	});
});

test("keeps an existing @inlang/cli version and check:i18n script", async () => {
	const { pkg, logged, warned } = await runAddInlangCheck({
		scripts: { "check:i18n": "my-own-check" },
		devDependencies: { "@inlang/cli": "3.5.0" },
	});

	expect(pkg.devDependencies).toEqual({ "@inlang/cli": "3.5.0" });
	expect(pkg.scripts).toEqual({ "check:i18n": "my-own-check" });
	expect(logged).toEqual([]);
	expect(warned).toEqual([]);
});

test("adds only the script when @inlang/cli is present, and warns about a CLI before 3.4.0", async () => {
	const { pkg, logged, warned } = await runAddInlangCheck({
		devDependencies: { "@inlang/cli": "3.2.0" },
	});

	expect(pkg.devDependencies).toEqual({ "@inlang/cli": "3.2.0" });
	expect(pkg.scripts).toEqual({
		"check:i18n": "inlang check --project ./project.inlang",
	});
	expect(logged).toEqual([
		"Added a check:i18n script that checks the translations to package.json.",
	]);
	expect(warned).toHaveLength(1);
	expect(warned[0]).toContain("needs @inlang/cli 3.4.0 or later");
});

test("adds only @inlang/cli when the check:i18n script exists", async () => {
	const { pkg, logged } = await runAddInlangCheck({
		scripts: { "check:i18n": "my-own-check" },
	});

	expect(pkg.devDependencies).toEqual({ "@inlang/cli": "^3.4.0" });
	expect(pkg.scripts).toEqual({ "check:i18n": "my-own-check" });
	expect(logged).toEqual([
		"Added @inlang/cli ^3.4.0 to the devDependencies in package.json.",
	]);
});
