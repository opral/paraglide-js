import { describe, expect, test, vi, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import consola from "consola";
import {
	clearParaglideConfigCache,
	loadParaglideConfig,
	CONFIG_FILE_NAMES,
	resolveConfigCandidate,
	isConfigFileName,
} from "./index.js";
import { Logger } from "../logger/index.js";

let testDirectories: string[] = [];

async function createProjectDirectory(): Promise<string> {
	const directory = await mkdtemp(path.join(tmpdir(), "paraglide-config-"));
	testDirectories.push(directory);
	return directory;
}

beforeEach(() => {
	clearParaglideConfigCache();
	vi.spyOn(consola, "warn").mockImplementation(() => {});
});

afterEach(async () => {
	vi.restoreAllMocks();
	for (const directory of testDirectories.splice(0)) {
		await rm(directory, { recursive: true, force: true });
	}
});

describe("resolveConfigCandidate", () => {
	test("returns undefined when no config file exists", async () => {
		const projectDir = await createProjectDirectory();
		expect(await resolveConfigCandidate(projectDir)).toBeUndefined();
	});

	test("prefers .js over .mjs over .ts over .cjs", async () => {
		const projectDir = await createProjectDirectory();
		for (const fileName of CONFIG_FILE_NAMES) {
			await writeFile(path.join(projectDir, fileName), "export default {}");
		}
		expect(await resolveConfigCandidate(projectDir)).toBe(
			path.join(projectDir, "paraglide.config.js")
		);
		await rm(path.join(projectDir, "paraglide.config.js"));
		expect(await resolveConfigCandidate(projectDir)).toBe(
			path.join(projectDir, "paraglide.config.mjs")
		);
		await rm(path.join(projectDir, "paraglide.config.mjs"));
		expect(await resolveConfigCandidate(projectDir)).toBe(
			path.join(projectDir, "paraglide.config.ts")
		);
		await rm(path.join(projectDir, "paraglide.config.ts"));
		expect(await resolveConfigCandidate(projectDir)).toBe(
			path.join(projectDir, "paraglide.config.cjs")
		);
	});

	test("isConfigFileName matches exactly the config names", () => {
		expect(isConfigFileName("/x/paraglide.config.js")).toBe(true);
		expect(isConfigFileName("/x/paraglide.config.cjs")).toBe(true);
		expect(isConfigFileName("/x/README.md")).toBe(false);
		expect(isConfigFileName("/x/other.config.js")).toBe(false);
	});
});

describe("loadParaglideConfig", () => {
	test("returns undefined when no config file exists", async () => {
		const projectDir = await createProjectDirectory();
		expect(await loadParaglideConfig({ projectDir })).toBeUndefined();
	});

	test("loads every supported file format with a default export", async () => {
		const cases: Array<[string, string]> = [
			["paraglide.config.js", `export default { outdir: './out-js' }`],
			["paraglide.config.mjs", `export default { outdir: './out-mjs' }`],
			["paraglide.config.cjs", `module.exports = { outdir: './out-cjs' }`],
			[
				"paraglide.config.ts",
				[
					"const config = {",
					'  outdir: "./out-ts",',
					'  strategy: ["cookie", "baseLocale"],',
					"}",
					"export default config",
				].join("\n"),
			],
		];

		for (const [fileName, content] of cases) {
			const projectDir = await createProjectDirectory();
			await writeFile(path.join(projectDir, fileName), content);

			const loaded = await loadParaglideConfig({ projectDir });
			expect(loaded?.path).toBe(path.join(projectDir, fileName));
		}
	});
	test("leaves outdir paths untouched — the integration resolves them", async () => {
		const projectDir = await createProjectDirectory();
		await writeFile(
			path.join(projectDir, "paraglide.config.ts"),
			"export default { outdir: '../out' }"
		);
		expect((await loadParaglideConfig({ projectDir }))?.config.outdir).toBe(
			"../out"
		);

		clearParaglideConfigCache();
		const absoluteOut = path.join(projectDir, "abs-out");
		await writeFile(
			path.join(projectDir, "paraglide.config.ts"),
			`export default { outdir: ${JSON.stringify(absoluteOut)} }`
		);
		expect((await loadParaglideConfig({ projectDir }))?.config.outdir).toBe(
			absoluteOut
		);
	});
	test("throws when the config file has no object export", async () => {
		const projectDir = await createProjectDirectory();
		await writeFile(
			path.join(projectDir, "paraglide.config.ts"),
			"export default 42"
		);

		await expect(loadParaglideConfig({ projectDir })).rejects.toThrow(
			/expected an object/
		);
	});

	test("throws when an option has an invalid value", async () => {
		const projectDir = await createProjectDirectory();
		await writeFile(
			path.join(projectDir, "paraglide.config.ts"),
			"export default { cookieMaxAge: 'forever' }"
		);

		await expect(loadParaglideConfig({ projectDir })).rejects.toThrow(
			/"cookieMaxAge"/
		);
	});

	test("throws when a strategy name is unknown", async () => {
		const projectDir = await createProjectDirectory();
		await writeFile(
			path.join(projectDir, "paraglide.config.ts"),
			"export default { strategy: ['cookie', 'cookies'] }"
		);

		await expect(loadParaglideConfig({ projectDir })).rejects.toThrow(
			/"strategy\.1"/
		);
	});

	test("accepts custom strategies matching the runtime pattern", async () => {
		const projectDir = await createProjectDirectory();
		await writeFile(
			path.join(projectDir, "paraglide.config.ts"),
			"export default { strategy: ['custom-server', 'custom-my_strategy-2', 'cookie'] }"
		);

		const loaded = await loadParaglideConfig({ projectDir });
		expect(loaded?.config.strategy).toEqual([
			"custom-server",
			"custom-my_strategy-2",
			"cookie",
		]);
	});

	test("rejects malformed custom strategy names", async () => {
		const projectDir = await createProjectDirectory();
		await writeFile(
			path.join(projectDir, "paraglide.config.ts"),
			"export default { strategy: ['custom-', 'custom-my strategy'] }"
		);

		await expect(loadParaglideConfig({ projectDir })).rejects.toThrow(
			/"strategy\.0"/
		);
	});

	test("throws when routeStrategies combine strategy and exclude", async () => {
		const projectDir = await createProjectDirectory();
		await writeFile(
			path.join(projectDir, "paraglide.config.ts"),
			[
				"export default {",
				"  routeStrategies: [{ match: '/admin', strategy: ['url'], exclude: true }],",
				"}",
			].join("\n")
		);

		await expect(loadParaglideConfig({ projectDir })).rejects.toThrow(
			/routeStrategies/
		);
	});

	test("throws when outputStructure is invalid", async () => {
		const projectDir = await createProjectDirectory();
		await writeFile(
			path.join(projectDir, "paraglide.config.ts"),
			"export default { outputStructure: 'modules' }"
		);

		await expect(loadParaglideConfig({ projectDir })).rejects.toThrow(
			/"outputStructure"/
		);
	});

	test("rejects an empty outdir", async () => {
		const projectDir = await createProjectDirectory();
		await writeFile(
			path.join(projectDir, "paraglide.config.ts"),
			"export default { outdir: '' }"
		);
		await expect(loadParaglideConfig({ projectDir })).rejects.toThrow(
			/"outdir"/
		);
	});

	test("warns about unknown options but loads the rest", async () => {
		const projectDir = await createProjectDirectory();
		await writeFile(
			path.join(projectDir, "paraglide.config.ts"),
			"export default { outdir: './out', outdirKye: './typo' }"
		);

		const loaded = await loadParaglideConfig({ projectDir });
		expect(loaded?.config.outdir).toBe("./out");
		expect(consola.warn).toHaveBeenCalledWith(
			expect.stringContaining('"outdirKye"')
		);
	});

	test("treats a legacy project key as an unknown option", async () => {
		const projectDir = await createProjectDirectory();
		await writeFile(
			path.join(projectDir, "paraglide.config.ts"),
			"export default { project: './elsewhere.inlang', outdir: './out' }"
		);

		const loaded = await loadParaglideConfig({ projectDir });
		expect(loaded?.config.outdir).toBe("./out");
		expect(consola.warn).toHaveBeenCalledWith(
			expect.stringContaining('"project"')
		);
	});

	test("accepts cleanOutdir silently (it is ignored)", async () => {
		const projectDir = await createProjectDirectory();
		await writeFile(
			path.join(projectDir, "paraglide.config.ts"),
			"export default { outdir: './out', cleanOutdir: true }"
		);

		const loaded = await loadParaglideConfig({ projectDir });
		expect(loaded?.config.cleanOutdir).toBe(true);
		for (const call of vi.mocked(consola.warn).mock.calls) {
			expect(String(call[0])).not.toContain("cleanOutdir");
		}
	});
	test("respects a silent logger for warnings", async () => {
		const projectDir = await createProjectDirectory();
		await writeFile(
			path.join(projectDir, "paraglide.config.ts"),
			"export default { outdir: './out', cleanOutdir: true, typoKey: 1 }"
		);

		const loaded = await loadParaglideConfig({
			projectDir,
			logger: new Logger({ silent: true, prefix: true }),
		});
		expect(loaded?.config.outdir).toBe("./out");
		expect(consola.warn).not.toHaveBeenCalled();
	});

	test("caches results until the cache is cleared", async () => {
		const projectDir = await createProjectDirectory();
		const configPath = path.join(projectDir, "paraglide.config.ts");
		await writeFile(configPath, "export default { outdir: './first' }");

		const first = await loadParaglideConfig({ projectDir });
		const second = await loadParaglideConfig({ projectDir });
		expect(second).toBe(first);

		await writeFile(configPath, "export default { outdir: './second' }");
		const stale = await loadParaglideConfig({ projectDir });
		expect(stale?.config.outdir).toBe("./first");

		clearParaglideConfigCache();
		const fresh = await loadParaglideConfig({ projectDir });
		expect(fresh?.config.outdir).toBe("./second");
	});

	// Reloading must pick up new content for every config file format —
	// async module imports would keep serving stale content for .mjs/.cjs.
	test("reloading picks up changed content for every file format", async () => {
		for (const fileName of CONFIG_FILE_NAMES) {
			const projectDir = await createProjectDirectory();
			const configPath = path.join(projectDir, fileName);
			const write = (outdir: string) =>
				writeFile(
					configPath,
					fileName.endsWith(".cjs")
						? `module.exports = { outdir: './${outdir}' }`
						: `export default { outdir: './${outdir}' }`
				);

			await write("first");
			const first = await loadParaglideConfig({ projectDir });
			expect(first?.config.outdir).toBe("./first");

			clearParaglideConfigCache();
			await write("second");
			const second = await loadParaglideConfig({ projectDir });
			expect(second?.config.outdir).toBe("./second");
		}
	});
});
