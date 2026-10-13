import { test, expect } from "vitest";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import ts from "typescript";

test("Oxlint runs the same plugin on JS and TS with import and scope tracking", async () => {
	const root = await mkdtemp(join(tmpdir(), "paraglide-oxlint-"));
	try {
		await writeFile(join(root, "package.json"), '{"type":"module"}');
		// Compile the current rule rather than depending on a potentially stale dist/.
		for (const file of ["index", "no-dynamic-message-access"]) {
			const source = await readFile(
				new URL(`./${file}.ts`, import.meta.url),
				"utf8"
			);
			await writeFile(
				join(root, `${file}.js`),
				ts.transpileModule(source, {
					compilerOptions: {
						module: ts.ModuleKind.ESNext,
						target: ts.ScriptTarget.ES2022,
					},
				}).outputText
			);
		}
		await writeFile(
			join(root, ".oxlintrc.json"),
			JSON.stringify({
				plugins: [],
				jsPlugins: [{ name: "paraglide", specifier: "./index.js" }],
				rules: { "paraglide/no-dynamic-message-access": "error" },
			})
		);
		const fixtures = {
			"dynamic.js":
				'import { m as labels } from "./paraglide/messages.js"; labels[key](); labels?.[key]?.(); const alias = labels; alias[key]; const { [key]: fn } = labels;',
			"dynamic.ts":
				'import * as labels from "$lib/paraglide/messages"; (labels as typeof labels)[key](); labels![key](); (labels satisfies typeof labels)[key](); const { m: alias } = labels; alias[key]();',
			"static.ts":
				'import { m } from "./paraglide/messages.js"; m.greeting(); m["greeting"](); const allowed = new Map([["hello", m.greeting]]); allowed.get(key)?.(); function render(m: Record<string, () => string>, key: string) { return m[key](); }',
		};
		for (const [file, code] of Object.entries(fixtures))
			await writeFile(join(root, file), code);
		let stdout: string;
		try {
			({ stdout } = await promisify(execFile)(process.execPath, [
				fileURLToPath(
					new URL("../../node_modules/oxlint/bin/oxlint", import.meta.url)
				),
				"--config",
				join(root, ".oxlintrc.json"),
				"--format",
				"json",
				...Object.keys(fixtures).map((file) => join(root, file)),
			]));
		} catch (error) {
			const failure = error as { code?: number; stdout?: string };
			if (failure.code !== 1 || !failure.stdout) throw error;
			stdout = failure.stdout;
		}
		const output = JSON.parse(stdout) as {
			diagnostics: Array<{ code: string; filename: string; message: string }>;
		};
		const diagnostics = output.diagnostics.filter(
			(item) => item.code === "paraglide(no-dynamic-message-access)"
		);
		expect(diagnostics).toHaveLength(8);
		expect(
			diagnostics.filter((item) => item.filename.endsWith("dynamic.js"))
		).toHaveLength(4);
		expect(
			diagnostics.filter((item) => item.filename.endsWith("dynamic.ts"))
		).toHaveLength(4);
		expect(
			diagnostics.some((item) => item.filename.endsWith("static.ts"))
		).toBe(false);
		expect(
			diagnostics.every((item) => item.message.includes("local map"))
		).toBe(true);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});
