import { mkdtemp, rm } from "node:fs/promises";
import * as nodeFs from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

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

test("compile seeds existing outdir and disables cleaning (#743)", async () => {
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
	const exitError = new Error("process.exit");
	const exitMock = vi.spyOn(process, "exit").mockImplementation(() => {
		throw exitError;
	});

	const { compileCommand } = await import("./command.js");

	await expect(
		compileCommand.parseAsync(
			[
				"--project",
				path.join(testDirectory, "project.inlang"),
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
