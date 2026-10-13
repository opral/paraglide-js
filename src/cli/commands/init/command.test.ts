import { test, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtemp, writeFile, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { Logger } from "../../../services/logger/index.js";
import { checkForUncommittedChanges } from "../../steps/check-for-uncomitted-changes.js";
import { fileURLToPath } from "node:url";
import * as defaults from "../../defaults.js";
import * as utils from "../../utils.js";
import { createInitCommand, runInit } from "./command.js";

let root: string;
beforeEach(async () => {
	root = await mkdtemp(join(tmpdir(), "paraglide-init-test-"));
	vi.spyOn(process, "cwd").mockReturnValue(root);
	vi.spyOn(utils, "prompt").mockImplementation(async () => {
		throw new Error("Unexpected prompt in headless init");
	});
	vi.spyOn(utils, "promptSelection").mockImplementation(async () => {
		throw new Error("Unexpected select in headless init");
	});
	const original = defaults.getNewProjectTemplate;
	vi.spyOn(defaults, "getNewProjectTemplate").mockImplementation(() => ({
		...original(),
		modules: [
			fileURLToPath(
				new URL(
					"../../../../node_modules/@inlang/plugin-message-format/dist/index.js",
					import.meta.url
				)
			),
		],
	}));
	await writeFile(
		join(root, "package.json"),
		JSON.stringify({
			name: "fixture",
			version: "1.0.0",
			scripts: { build: "vite build" },
		})
	);
});
afterEach(async () => {
	vi.restoreAllMocks();
	process.exitCode = 0;
	await rm(root, { recursive: true, force: true });
});

test("headless setup and rerun preserve project/messages/comments and skip optional tools", async () => {
	await writeFile(
		join(root, "tsconfig.json"),
		'// keep this comment\n{ "compilerOptions": { "strict": true, }, }\n'
	);
	await runInit({ yes: true, compile: false });
	const packageFirst = await readFile(join(root, "package.json"), "utf8");
	const settingsFirst = await readFile(
		join(root, "project.inlang/settings.json"),
		"utf8"
	);
	const messagesFirst = await readFile(join(root, "messages/en.json"), "utf8");
	await runInit({ nonInteractive: true, compile: false });
	expect(await readFile(join(root, "package.json"), "utf8")).toBe(packageFirst);
	expect(
		await readFile(join(root, "project.inlang/settings.json"), "utf8")
	).toBe(settingsFirst);
	expect(await readFile(join(root, "messages/en.json"), "utf8")).toBe(
		messagesFirst
	);
	const tsconfig = await readFile(join(root, "tsconfig.json"), "utf8");
	expect(tsconfig).toContain("keep this comment");
	expect(tsconfig).toContain('"allowJs": true');
	expect(tsconfig).toContain('"strict": true');
	const pkg = JSON.parse(packageFirst);
	expect(pkg.scripts["machine-translate"]).toBeUndefined();
	expect(pkg.scripts["lint:i18n"]).toBeUndefined();
	expect(pkg.devDependencies.eslint).toBeUndefined();
	expect(utils.prompt).not.toHaveBeenCalled();
	expect(utils.promptSelection).not.toHaveBeenCalled();
});

test("explicit paths and ESLint setup work without prompts", async () => {
	await writeFile(
		join(root, "eslint.config.mjs"),
		"// preserve existing config"
	);
	await runInit({
		yes: true,
		project: "./config/project.inlang",
		outdir: "./src/i18n",
		lint: "eslint",
		check: false,
		compile: false,
	});
	const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
	expect(pkg.scripts["check:i18n"]).toBeUndefined();
	expect(pkg.scripts["lint:i18n"]).toContain("eslint.paraglide.config.mjs");
	expect(await readFile(join(root, "eslint.config.mjs"), "utf8")).toBe(
		"// preserve existing config"
	);
	const settings = JSON.parse(
		await readFile(join(root, "config/project.inlang/settings.json"), "utf8")
	);
	expect(settings["plugin.inlang.messageFormat"].pathPattern).toBe(
		"../messages/{locale}.json"
	);
	expect(pkg.scripts.build).toContain("./config/project.inlang");
	expect(pkg.scripts.build).toContain("./src/i18n");
});

test("closed input without an unattended flag fails before writes", async () => {
	await expect(runInit({})).rejects.toThrow("Use --yes");
	expect(await readdir(root)).toEqual(["package.json"]);
});

test("unwritable integration and invalid paths fail before scaffolding", async () => {
	await writeFile(
		join(root, "vite.config.ts"),
		"export default () => ({plugins:getPlugins()});"
	);
	await expect(runInit({ yes: true })).rejects.toThrow(
		"Vite configuration cannot"
	);
	expect((await readdir(root)).sort()).toEqual([
		"package.json",
		"vite.config.ts",
	]);
	await expect(runInit({ yes: true, outdir: "." })).rejects.toThrow("distinct");
});

test("CLI help exposes unattended mode and optional lint choices", () => {
	const help = createInitCommand().helpInformation();
	for (const flag of [
		"--yes",
		"--non-interactive",
		"--outdir",
		"--project",
		"--lint",
		"--allow-dirty",
		"--no-compile",
	])
		expect(help).toContain(flag);
});

test("dirty git trees require explicit permission without prompting", async () => {
	await promisify(execFile)("git", ["init", root]);
	const ctx = {
		logger: new Logger({ silent: true, prefix: false }),
		root,
		interactive: false,
	};
	await expect(checkForUncommittedChanges(ctx)).rejects.toThrow(
		"--allow-dirty"
	);
	await expect(
		checkForUncommittedChanges({ ...ctx, allowDirty: true })
	).resolves.toBeDefined();
	expect(utils.prompt).not.toHaveBeenCalled();
});

test("invalid lint choices fail before creating files", async () => {
	const command = createInitCommand().exitOverride();
	await expect(
		command.parseAsync(["--yes", "--lint", "invalid"], { from: "user" })
	).rejects.toThrow("Allowed choices");
	expect(await readdir(root)).toEqual(["package.json"]);
});
