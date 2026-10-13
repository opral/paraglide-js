import { test, expect, vi, afterEach } from "vitest";
import { memfs } from "memfs";
import type { InlangProject } from "@inlang/sdk";
import * as Sherlock from "@inlang/recommend-sherlock";
import { Logger } from "../../services/logger/index.js";
import { getNewProjectTemplate } from "../defaults.js";
import { maybeAddSherlock } from "./maybe-add-sherlock.js";

vi.mock("@inlang/recommend-sherlock", () => ({
	isAdopted: vi.fn().mockResolvedValue(false),
	add: vi.fn().mockResolvedValue(undefined),
}));
afterEach(() => {
	vi.unstubAllEnvs();
	vi.clearAllMocks();
});

test("headless setup skips editor recommendations unless explicitly requested", async () => {
	vi.stubEnv("TERM_PROGRAM", "vscode");
	const fs = memfs().fs as unknown as typeof import("node:fs");
	const project = {
		settings: { get: vi.fn().mockResolvedValue(getNewProjectTemplate()) },
	} as unknown as InlangProject;
	await maybeAddSherlock({
		fs: fs.promises,
		project,
		logger: new Logger({ silent: true, prefix: false }),
		interactive: false,
	});
	expect(Sherlock.add).not.toHaveBeenCalled();
});

test("explicit editor opt-in works headlessly outside a VSCode terminal", async () => {
	vi.stubEnv("TERM_PROGRAM", "");
	const fs = memfs().fs as unknown as typeof import("node:fs");
	const project = {
		settings: { get: vi.fn().mockResolvedValue(getNewProjectTemplate()) },
	} as unknown as InlangProject;
	await maybeAddSherlock({
		fs: fs.promises,
		project,
		logger: new Logger({ silent: true, prefix: false }),
		interactive: false,
		sherlock: true,
	});
	expect(Sherlock.add).toHaveBeenCalledOnce();
});
