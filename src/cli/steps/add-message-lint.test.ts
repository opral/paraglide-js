import { test, expect } from "vitest";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import fs from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { addMessageLint, preflightMessageLint } from "./add-message-lint.js";
import { Logger } from "../../services/logger/index.js";

for (const lint of ["eslint", "oxlint"] as const)
	test(`${lint} setup is optional, additive and repeatable`, async () => {
		const root = await mkdtemp(join(tmpdir(), "paraglide-lint-init-"));
		try {
			const packageJsonPath = join(root, "package.json");
			const configPath = join(
				root,
				lint === "eslint" ? "eslint.config.mjs" : ".oxlintrc.json"
			);
			const original = "// existing config sentinel\n";
			await writeFile(configPath, original);
			await writeFile(
				packageJsonPath,
				JSON.stringify({
					scripts: { lint: "existing-lint" },
					devDependencies:
						lint === "eslint" ? { eslint: "^10.0.0" } : { oxlint: "^1.88.0" },
				})
			);
			const ctx = {
				fs,
				root,
				packageJsonPath,
				outdir: "./src/i18n",
				lint,
				logger: new Logger({ silent: true, prefix: false }),
			};
			await addMessageLint(ctx);
			const first = await readFile(packageJsonPath, "utf8");
			await addMessageLint(ctx);
			expect(await readFile(packageJsonPath, "utf8")).toBe(first);
			expect(await readFile(configPath, "utf8")).toBe(original);
			const pkg = JSON.parse(first);
			expect(pkg.scripts.lint).toBe("existing-lint");
			expect(pkg.scripts["lint:i18n"]).toContain(
				lint === "eslint"
					? "eslint.paraglide.config.mjs"
					: ".oxlintrc.paraglide.json"
			);
			expect(pkg.devDependencies[lint]).toBe(
				lint === "eslint" ? "^10.0.0" : "^1.88.0"
			);
			const generated = await readFile(
				join(
					root,
					lint === "eslint"
						? "eslint.paraglide.config.mjs"
						: ".oxlintrc.paraglide.json"
				),
				"utf8"
			);
			expect(generated).toContain("messageModuleDirectories");
			expect(generated).toContain("i18n");
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

test("lint conflicts fail before writing dependencies or replacing files", async () => {
	const root = await mkdtemp(join(tmpdir(), "paraglide-lint-conflict-"));
	try {
		const packageJsonPath = join(root, "package.json");
		const before = JSON.stringify({ scripts: { "lint:i18n": "custom-tool" } });
		await writeFile(packageJsonPath, before);
		const ctx = {
			fs,
			root,
			packageJsonPath,
			outdir: "./src/paraglide",
			lint: "eslint" as const,
			logger: new Logger({ silent: true, prefix: false }),
		};
		await expect(preflightMessageLint(ctx)).rejects.toThrow(
			"unrelated lint:i18n"
		);
		expect(await readFile(packageJsonPath, "utf8")).toBe(before);
		await writeFile(packageJsonPath, "{}");
		await writeFile(
			join(root, "eslint.paraglide.config.mjs"),
			"custom sentinel"
		);
		await expect(addMessageLint(ctx)).rejects.toThrow("not be overwritten");
		expect(
			await readFile(join(root, "eslint.paraglide.config.mjs"), "utf8")
		).toBe("custom sentinel");
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});
