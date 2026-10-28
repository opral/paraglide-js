import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { Logger } from "../../../services/logger/index.js";
import { createInitCommand } from "./definition.js";

const implementation = vi.hoisted(() => ({
	loaded: vi.fn(),
	runInit: vi.fn(),
}));
vi.mock("./command.js", () => {
	implementation.loaded();
	return { runInit: implementation.runInit };
});
beforeEach(() => {
	implementation.runInit.mockReset();
});
afterEach(() => {
	vi.restoreAllMocks();
	process.exitCode = 0;
});

test("help stays independent of init implementation and action preserves explicit option sources", async () => {
	const command = createInitCommand();
	expect(command.helpInformation()).toContain("--non-interactive");
	expect(implementation.loaded).not.toHaveBeenCalled();
	await command.parseAsync(
		[
			"--yes",
			"--allow-dirty",
			"--project",
			"custom.inlang",
			"--outdir",
			"messages",
			"--lint",
			"eslint",
			"--no-check",
			"--no-compile",
			"--no-sherlock",
			"--machine-translation",
		],
		{ from: "user" }
	);
	expect(implementation.loaded).toHaveBeenCalledOnce();
	expect(implementation.runInit).toHaveBeenLastCalledWith(
		expect.objectContaining({
			yes: true,
			allowDirty: true,
			project: "custom.inlang",
			outdir: "messages",
			lint: "eslint",
			check: false,
			compile: false,
			sherlock: false,
			machineTranslation: true,
		})
	);
	await createInitCommand().parseAsync(["--non-interactive"], { from: "user" });
	expect(implementation.runInit).toHaveBeenLastCalledWith(
		expect.objectContaining({
			nonInteractive: true,
			project: "./project.inlang",
			check: true,
			compile: true,
			sherlock: undefined,
			machineTranslation: undefined,
		})
	);
});

test.each([new Error("setup failed"), "setup string failure"])(
	"lazy init action preserves error reporting and exit status: %s",
	async (failure) => {
		implementation.runInit.mockRejectedValueOnce(failure);
		const report = vi.spyOn(Logger.prototype, "error").mockReturnThis();
		await expect(
			createInitCommand().parseAsync(["--yes"], { from: "user" })
		).resolves.toBeDefined();
		expect(report).toHaveBeenCalledWith(
			failure instanceof Error ? failure.message : failure
		);
		expect(process.exitCode).toBe(1);
	}
);
