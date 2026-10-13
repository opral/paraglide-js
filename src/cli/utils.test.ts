import { test, expect } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { shellArgument } from "./utils.js";

test.each([
	"./src/paraglide",
	"space directory",
	"quote'path",
	"literal$word",
	"semi;colon",
	"back`tick",
])("package scripts preserve literal path %s", async (value) => {
	const { stdout } = await promisify(execFile)(
		"/bin/sh",
		["-c", "printf '%s' " + shellArgument(value)],
		{ env: {} }
	);
	expect(stdout).toBe(value);
});
