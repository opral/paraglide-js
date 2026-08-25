import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import * as nodeFs from "node:fs/promises";
import { tmpdir } from "node:os";
import consola from "consola";
import path, { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

let testDirectories: string[] = [];
let initialSigintListeners: NodeJS.SignalsListener[] = [];

beforeEach(() => {
	vi.resetModules();
	testDirectories = [];
	initialSigintListeners = process.listeners("SIGINT");
});

afterEach(async () => {
	vi.restoreAllMocks();
	for (const listener of process.listeners("SIGINT")) {
		if (!initialSigintListeners.includes(listener)) {
			process.removeListener("SIGINT", listener);
		}
	}
	for (const directory of testDirectories) {
		await rm(directory, { recursive: true, force: true });
	}
});

/**
 * Creates `<dir>/project.inlang/paraglide.config.ts` with the given
 * outdir — the layout of the new config-in-project model.
 */
async function writeConfig(
	projectDir: string,
	outdir: string,
	fileName = "paraglide.config.ts"
) {
	await mkdir(projectDir, { recursive: true });
	await writeFile(
		path.join(projectDir, fileName),
		["export default {", `  outdir: ${JSON.stringify(outdir)},`, "}"].join("\n")
	);
}

async function createWorkspace() {
	const workspace = await mkdtemp(path.join(tmpdir(), "paraglide-cli-"));
	testDirectories.push(workspace);
	const projectDir = path.join(workspace, "project.inlang");
	return { workspace, projectDir };
}

test("compile seeds existing outdir and disables cleaning (#743)", async () => {
	const { workspace } = await createWorkspace();
	const outdir = path.join(workspace, "output");
	const { writeOutput } =
		await import("../../../services/file-handling/write-output.js");
	await writeOutput({
		directory: outdir,
		output: {
			"runtime.js": "export const runtime = true;",
		},
		fs: nodeFs,
	});

	const compileMock = vi.fn().mockResolvedValue({
		outputHashes: {
			"runtime.js": "next-hash",
		},
	});
	vi.doMock("../../../compiler/compile.js", () => ({
		compile: compileMock,
	}));
	const exitError = new Error("process.exit");
	const exitMock = vi.spyOn(process, "exit").mockImplementation(() => {
		throw exitError;
	});

	const { compileCommand } = await import("./command.js");

	await expect(
		compileCommand.parseAsync(
			[
				"--project",
				path.join(workspace, "project.inlang"),
				"--outdir",
				outdir,
				"--silent",
			],
			{ from: "user" }
		)
	).rejects.toBe(exitError);

	expect(compileMock).toHaveBeenCalledTimes(1);
	expect(compileMock).toHaveBeenCalledWith(
		expect.objectContaining({
			outdir,
			cleanOutdir: false,
			previousCompilation: {
				outputHashes: {
					"runtime.js": expect.any(String),
				},
			},
		})
	);
	expect(exitMock).toHaveBeenCalledWith(0);
});

test("compile exposes and forwards compiler options missing from the CLI (#757)", async () => {
	const testDirectory = await mkdtemp(path.join(tmpdir(), "paraglide-cli-"));
	testDirectories.push(testDirectory);
	const outdir = path.join(testDirectory, "output");
	await nodeFs.mkdir(outdir, { recursive: true });
	await nodeFs.writeFile(path.join(outdir, "custom.txt"), "keep me");

	const compileMock = vi.fn().mockResolvedValue({ outputHashes: {} });
	vi.doMock("../../../compiler/compile.js", () => ({
		compile: compileMock,
	}));
	const exitError = new Error("process.exit");
	vi.spyOn(process, "exit").mockImplementation(() => {
		throw exitError;
	});

	const { compileCommand } = await import("./command.js");
	const help = compileCommand.helpInformation();

	expect(help).toContain("--clean-outdir");
	expect(help).toContain("--no-clean-outdir");
	expect(help).toContain("--experimental-static-locale <expression>");
	expect(help).toContain("--disable-async-local-storage");

	await expect(
		compileCommand.parseAsync(
			[
				"--project",
				path.join(testDirectory, "project.inlang"),
				"--outdir",
				outdir,
				"--no-clean-outdir",
				"--experimental-static-locale",
				'import.meta.env.PARAGLIDE_LOCALE ?? "en"',
				"--disable-async-local-storage",
				"--silent",
			],
			{ from: "user" }
		)
	).rejects.toBe(exitError);

	expect(compileMock).toHaveBeenCalledTimes(1);
	expect(compileMock).toHaveBeenCalledWith(
		expect.objectContaining({
			cleanOutdir: false,
			disableAsyncLocalStorage: true,
			experimentalStaticLocale: 'import.meta.env.PARAGLIDE_LOCALE ?? "en"',
			previousCompilation: undefined,
		})
	);
});

test("compile --watch seeds existing outdir and disables cleaning on first compile (#688)", async () => {
	const testDirectory = await mkdtemp(path.join(tmpdir(), "paraglide-cli-"));
	testDirectories.push(testDirectory);
	const outdir = path.join(testDirectory, "output");
	const { writeOutput } = await import(
		"../../../services/file-handling/write-output.js"
	);
	await writeOutput({
		directory: outdir,
		output: {
			"runtime.js": "export const runtime = true;",
		},
		fs: nodeFs,
	});

	const compileMock = vi.fn().mockResolvedValue({
		outputHashes: {
			"runtime.js": "next-hash",
		},
	});
	vi.doMock("../../../compiler/compile.js", () => ({
		compile: compileMock,
	}));

	const { compileCommand } = await import("./command.js");

	await compileCommand.parseAsync(
		[
			"--project",
			path.join(testDirectory, "project.inlang"),
			"--outdir",
			outdir,
			"--watch",
			"--silent",
		],
		{ from: "user" }
	);

	expect(compileMock).toHaveBeenCalledTimes(1);
	expect(compileMock).toHaveBeenCalledWith(
		expect.objectContaining({
			outdir,
			cleanOutdir: false,
			previousCompilation: {
				outputHashes: {
					"runtime.js": expect.any(String),
				},
			},
		})
	);
});

describe("config file integration", () => {
	test("compile reads options from a config file inside --project", async () => {
		const { workspace, projectDir } = await createWorkspace();
		const outdir = path.join(workspace, "from-config");
		await writeConfig(projectDir, outdir);

		const compileMock = vi.fn().mockResolvedValue({});
		vi.doMock("../../../compiler/compile.js", () => ({
			compile: compileMock,
		}));
		const exitError = new Error("process.exit");
		vi.spyOn(process, "exit").mockImplementation(() => {
			throw exitError;
		});

		const { compileCommand } = await import("./command.js");

		await expect(
			compileCommand.parseAsync(["--project", projectDir, "--silent"], {
				from: "user",
			})
		).rejects.toBe(exitError);

		expect(compileMock).toHaveBeenCalledWith(
			expect.objectContaining({
				project: projectDir,
				outdir,
				strategy: ["cookie", "globalVariable", "baseLocale"],
				emitReadme: true,
			})
		);
	});

	test("discovers the conventional ./project.inlang without flags", async () => {
		const { workspace, projectDir } = await createWorkspace();
		const outdir = path.join(workspace, "from-config");
		await writeConfig(projectDir, outdir);

		const compileMock = vi.fn().mockResolvedValue({});
		vi.doMock("../../../compiler/compile.js", () => ({
			compile: compileMock,
		}));
		const exitError = new Error("process.exit");
		vi.spyOn(process, "exit").mockImplementation(() => {
			throw exitError;
		});
		const cwdMock = vi.spyOn(process, "cwd").mockReturnValue(workspace);

		try {
			const { compileCommand } = await import("./command.js");

			await expect(
				compileCommand.parseAsync(["--silent"], { from: "user" })
			).rejects.toBe(exitError);

			expect(compileMock).toHaveBeenCalledWith(
				expect.objectContaining({
					project: projectDir,
					outdir,
				})
			);
		} finally {
			cwdMock.mockRestore();
		}
	});

	test("announces the conventional project default when --project is omitted", async () => {
		const { workspace, projectDir } = await createWorkspace();
		const outdir = path.join(workspace, "from-config");
		await writeConfig(projectDir, outdir);

		const compileMock = vi.fn().mockResolvedValue({});
		vi.doMock("../../../compiler/compile.js", () => ({
			compile: compileMock,
		}));
		const exitError = new Error("process.exit");
		vi.spyOn(process, "exit").mockImplementation(() => {
			throw exitError;
		});
		const infoSpy = vi.spyOn(consola, "info").mockImplementation(() => {});

		const { compileCommand } = await import("./command.js");
		const cwdMock = vi.spyOn(process, "cwd").mockReturnValue(workspace);

		try {
			await expect(
				compileCommand.parseAsync(
					["--outdir", outdir], // no --project, no --silent
					{ from: "user" }
				)
			).rejects.toBe(exitError);

			expect(compileMock).toHaveBeenCalledWith(
				expect.objectContaining({
					project: projectDir,
					outdir,
				})
			);
			expect(
				infoSpy.mock.calls.some((call) =>
					String(call[0]).includes("--project was not provided")
				)
			).toBe(true);
		} finally {
			cwdMock.mockRestore();
		}
	});

	test("command line flags override config file values", async () => {
		const { workspace, projectDir } = await createWorkspace();
		await writeConfig(projectDir, path.join(workspace, "from-config"));

		const compileMock = vi.fn().mockResolvedValue({});
		vi.doMock("../../../compiler/compile.js", () => ({
			compile: compileMock,
		}));
		const exitError = new Error("process.exit");
		vi.spyOn(process, "exit").mockImplementation(() => {
			throw exitError;
		});

		const { compileCommand } = await import("./command.js");

		await expect(
			compileCommand.parseAsync(
				[
					"--project",
					projectDir,
					"--outdir",
					"./from-flag",
					"--strategy",
					"cookie",
					"baseLocale",
					"--silent",
				],
				{ from: "user" }
			)
		).rejects.toBe(exitError);

		expect(compileMock).toHaveBeenCalledWith(
			expect.objectContaining({
				project: projectDir,
				outdir: resolve(process.cwd(), "./from-flag"),
				strategy: ["cookie", "baseLocale"],
			})
		);
	});

	// Deleting the config file mid-watch falls back to the built-in
	// defaults (same as never having a config); recreating it is picked up.
	test("watch falls back to defaults when the config is deleted", async () => {
		const { workspace, projectDir } = await createWorkspace();
		const configPath = path.join(projectDir, "paraglide.config.ts");
		const outdir = path.join(workspace, "from-config");
		await writeConfig(projectDir, outdir);

		const compileMock = vi.fn().mockResolvedValue({});
		vi.doMock("../../../compiler/compile.js", () => ({
			compile: compileMock,
		}));

		const { compileCommand } = await import("./command.js");

		await compileCommand.parseAsync(
			["--project", projectDir, "--watch", "--silent"],
			{ from: "user" }
		);
		expect(compileMock).toHaveBeenCalledTimes(1);
		expect(compileMock.mock.calls[0]![0].outdir).toBe(outdir);

		await rm(configPath);

		const deadline = Date.now() + 10_000;
		while (compileMock.mock.calls.length < 2 && Date.now() < deadline) {
			await new Promise((r) => setTimeout(r, 50));
		}

		expect(compileMock.mock.calls.length).toBeGreaterThanOrEqual(2);
		for (const call of compileMock.mock.calls.slice(1)) {
			// Default outdir, resolved against the working directory.
			expect(
				String(call[0].outdir).endsWith(path.join("src", "paraglide"))
			).toBe(true);
			expect(call[0].project).toBe(projectDir);
		}

		// Recreating the config with a different outdir is picked up again.
		await writeConfig(projectDir, path.join(workspace, "recreated"));
		const recreateDeadline = Date.now() + 10_000;
		while (
			Date.now() < recreateDeadline &&
			!compileMock.mock.calls.some((c) =>
				String(c[0].outdir).endsWith("recreated")
			)
		) {
			await new Promise((r) => setTimeout(r, 50));
		}
		expect(
			compileMock.mock.calls.some((c) =>
				String(c[0].outdir).endsWith("recreated")
			)
		).toBe(true);
	});

	// Renaming the config between formats switches to the new winner.
	// A NEW non-config file appearing directly in the project directory (e.g.
	// a locale JSON for a freshly added locale) must schedule a rebuild even
	// though no per-file watcher exists for it yet.
	test("watch recompiles when a new input appears in the project directory", async () => {
		const { workspace, projectDir } = await createWorkspace();
		await writeConfig(projectDir, path.join(workspace, "from-config"));

		const compileMock = vi.fn().mockResolvedValue({});
		vi.doMock("../../../compiler/compile.js", () => ({
			compile: compileMock,
		}));

		const { compileCommand } = await import("./command.js");

		await compileCommand.parseAsync(
			["--project", projectDir, "--watch", "--silent"],
			{ from: "user" }
		);
		expect(compileMock).toHaveBeenCalledTimes(1);

		await writeFile(path.join(projectDir, "es.json"), "{}");

		const deadline = Date.now() + 10_000;
		while (compileMock.mock.calls.length < 2 && Date.now() < deadline) {
			await new Promise((r) => setTimeout(r, 50));
		}
		expect(compileMock.mock.calls.length).toBeGreaterThanOrEqual(2);
	});

	test("watch follows config renames between formats", async () => {
		const { workspace, projectDir } = await createWorkspace();
		const tsPath = path.join(projectDir, "paraglide.config.ts");
		const jsPath = path.join(projectDir, "paraglide.config.js");
		const outdirA = path.join(workspace, "out-ts");
		const outdirB = path.join(workspace, "out-js");
		await writeConfig(projectDir, outdirA);

		const compileMock = vi.fn().mockResolvedValue({});
		vi.doMock("../../../compiler/compile.js", () => ({
			compile: compileMock,
		}));

		const { compileCommand } = await import("./command.js");

		await compileCommand.parseAsync(
			["--project", projectDir, "--watch", "--silent"],
			{ from: "user" }
		);
		expect(compileMock.mock.calls[0]![0].outdir).toBe(outdirA);

		// Format switch: delete .ts, add .js.
		await rm(tsPath);
		await writeFile(
			jsPath,
			["export default {", `  outdir: ${JSON.stringify(outdirB)},`, "}"].join(
				"\n"
			)
		);

		const deadline = Date.now() + 10_000;
		while (
			Date.now() < deadline &&
			!compileMock.mock.calls.some((c) => c[0].outdir === outdirB)
		) {
			await new Promise((r) => setTimeout(r, 50));
		}
		expect(compileMock.mock.calls.some((c) => c[0].outdir === outdirB)).toBe(
			true
		);
	});

	// Non-config changes inside the project directory DO rebuild (new
	// inputs can appear there) but must NOT reload the config.
	test("watch recompiles without reloading config for non-config changes", async () => {
		const { workspace, projectDir } = await createWorkspace();
		await writeConfig(projectDir, path.join(workspace, "from-config"));

		let loadCount = 0;
		vi.doMock("../../../compiler/compile.js", () => ({
			compile: vi.fn().mockResolvedValue({}),
		}));
		vi.doMock("../../../services/config/index.js", async (importActual) => {
			const actual =
				await importActual<
					typeof import("../../../services/config/index.js")
				>();
			return {
				...actual,
				loadParaglideConfig: (
					...args: Parameters<typeof actual.loadParaglideConfig>
				) => {
					loadCount++;
					return actual.loadParaglideConfig(...args);
				},
			};
		});

		try {
			const { compileCommand } = await import("./command.js");
			const compileModule = (await import("../../../compiler/compile.js")) as {
				compile: ReturnType<typeof vi.fn>;
			};

			await compileCommand.parseAsync(
				["--project", projectDir, "--watch", "--silent"],
				{ from: "user" }
			);
			expect(compileModule.compile).toHaveBeenCalledTimes(1);
			expect(loadCount).toBe(1);

			await writeFile(path.join(projectDir, "README.md"), "hello");
			await new Promise((r) => setTimeout(r, 1_000));
			await writeFile(path.join(projectDir, "notes.txt"), "world");
			await new Promise((r) => setTimeout(r, 1_500));

			expect(compileModule.compile.mock.calls.length).toBeGreaterThanOrEqual(3);
			expect(loadCount).toBe(1);
		} finally {
			vi.doUnmock("../../../services/config/index.js");
		}
	});
});

test("compile --watch forwards the newly exposed compiler options (#757)", async () => {
	const testDirectory = await mkdtemp(path.join(tmpdir(), "paraglide-cli-"));
	testDirectories.push(testDirectory);
	const outdir = path.join(testDirectory, "output");

	const compileMock = vi.fn().mockResolvedValue({ outputHashes: {} });
	vi.doMock("../../../compiler/compile.js", () => ({
		compile: compileMock,
	}));

	const { compileCommand } = await import("./command.js");

	await compileCommand.parseAsync(
		[
			"--project",
			path.join(testDirectory, "project.inlang"),
			"--outdir",
			outdir,
			"--watch",
			"--no-clean-outdir",
			"--experimental-static-locale",
			'"de"',
			"--disable-async-local-storage",
			"--silent",
		],
		{ from: "user" }
	);

	expect(compileMock).toHaveBeenCalledTimes(1);
	expect(compileMock).toHaveBeenCalledWith(
		expect.objectContaining({
			cleanOutdir: false,
			disableAsyncLocalStorage: true,
			experimentalStaticLocale: '"de"',
			previousCompilation: undefined,
		})
	);
});
