import { expect, test, vi } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { resolveNativeTscJsPath } from "./resolve-tsc-js-path.js";

test("resolveNativeTscJsPath only accepts TypeScript 7+ under the @typescript/native alias", async () => {
	const project = await fs.realpath(
		await fs.mkdtemp(path.join(os.tmpdir(), "paraglide-native-tsc-"))
	);
	const alias = path.join(project, "node_modules", "@typescript", "native");
	const tscJsPath = path.join(alias, "lib", "tsc.js");
	await fs.mkdir(path.dirname(tscJsPath), { recursive: true });
	await fs.writeFile(tscJsPath, "");
	vi.spyOn(process, "cwd").mockReturnValue(project);

	try {
		const cases: Array<[packageJson: unknown, expected: string | undefined]> = [
			[{ name: "typescript", version: "7.0.2" }, tscJsPath],
			// the CLI of TypeScript 5/6 would emit invalid quoted export aliases
			[{ name: "typescript", version: "6.0.3" }, undefined],
			[{ name: "typescript" }, undefined],
			[null, undefined],
		];
		for (const [packageJson, expected] of cases) {
			await fs.writeFile(
				path.join(alias, "package.json"),
				JSON.stringify(packageJson)
			);
			expect(resolveNativeTscJsPath()).toBe(expected);
		}
	} finally {
		vi.restoreAllMocks();
		await fs.rm(project, { recursive: true, force: true });
	}
});
