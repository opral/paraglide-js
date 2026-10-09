import { afterEach, beforeEach, expect, test } from "vitest";
import { memfs } from "memfs";
import { addInlangCheck } from "./add-inlang-check.js";
import { agentsMdSuggestion } from "./agents-md-suggestion.js";
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
	await addInlangCheck({
		fs: fs.promises,
		logger: new Logger({ silent: true, prefix: false }),
		projectPath: "./project.inlang",
		root: "/",
		packageJsonPath: "/package.json",
	});
	return JSON.parse(await fs.promises.readFile("/package.json", "utf-8"));
}

test("adds @inlang/cli and a check:i18n script", async () => {
	const pkg = await runAddInlangCheck({
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
});

test("adds devDependencies and scripts to a package.json without them", async () => {
	const pkg = await runAddInlangCheck({ name: "app" });

	expect(pkg.devDependencies).toEqual({ "@inlang/cli": "^3.4.0" });
	expect(pkg.scripts).toEqual({
		"check:i18n": "inlang check --project ./project.inlang",
	});
});

test("keeps an existing @inlang/cli version and check:i18n script", async () => {
	const pkg = await runAddInlangCheck({
		scripts: { "check:i18n": "my-own-check" },
		devDependencies: { "@inlang/cli": "3.5.0" },
	});

	expect(pkg.devDependencies).toEqual({ "@inlang/cli": "3.5.0" });
	expect(pkg.scripts).toEqual({ "check:i18n": "my-own-check" });
});

test("the AGENTS.md suggestion names the project, message files and outdir", () => {
	expect(
		agentsMdSuggestion({
			root: "/app",
			projectPath: "./project.inlang",
			pathPattern: "./messages/{locale}.json",
			outdir: "./src/paraglide",
		})
	).toBe(
		[
			"If you use coding agents, consider adding this to your AGENTS.md:",
			"",
			"## Localization",
			"- Translations are an inlang project. Before localization work, read `project.inlang/README.md`. It covers checks, machine translation and editors. It is git-ignored, so search tools may skip it.",
			"- Edit messages in `messages/{locale}.json`. Never edit `src/paraglide/`: Paraglide JS generates it.",
		].join("\n")
	);
});

test("the AGENTS.md suggestion uses custom paths relative to the root", () => {
	const suggestion = agentsMdSuggestion({
		root: "/app",
		projectPath: "/app/i18n/project.inlang",
		pathPattern: "./i18n/{locale}/common.json",
		outdir: "./lib/paraglide/",
	});

	expect(suggestion).toContain("`i18n/project.inlang/README.md`");
	expect(suggestion).toContain("`i18n/{locale}/common.json`");
	expect(suggestion).toContain("Never edit `lib/paraglide/`");
});
