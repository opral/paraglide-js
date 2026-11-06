import { test, expect, vi } from "vitest";

test.each([
	["win32", "C:\\app\\src\\..\\runtime.js", "C:/app/runtime.js"],
	["win32", "C:/app//src/../runtime.js", "C:/app/runtime.js"],
	[
		"win32",
		"\\\\server\\share\\project.inlang",
		"//server/share/project.inlang",
	],
	[
		"win32",
		"//server/share/src/../project.inlang",
		"//server/share/project.inlang",
	],
	["win32", "//server/share/", "//server/share/"],
	["win32", "\\\\?\\C:\\app\\runtime.js", "//?/C:/app/runtime.js"],
	["win32", "./src/../runtime.js", "runtime.js"],
	["linux", "/app//src/../runtime.js", "/app/runtime.js"],
	["linux", "/app/file\\name.js", "/app/file\\name.js"],
])("normalizes %s path %s to %s", async (platform, input, expected) => {
	vi.resetModules();
	vi.stubGlobal("process", { ...process, platform });
	try {
		const { nodeNormalizePath } = await import("./node-normalize-path.js");
		expect(nodeNormalizePath(input)).toBe(expected);
		// Watchers normalize both tracked paths and incoming events.
		expect(nodeNormalizePath(nodeNormalizePath(input))).toBe(expected);
	} finally {
		vi.unstubAllGlobals();
		vi.resetModules();
	}
});
