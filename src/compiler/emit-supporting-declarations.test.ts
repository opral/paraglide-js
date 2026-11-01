import { describe, expect, test } from "vitest";
import fs from "node:fs";

describe("supporting declaration templates", () => {
	test("templates cannot shadow implementation JavaScript during type checking", () => {
		for (const name of ["runtime", "server", "registry", "routing-index"]) {
			expect(
				fs.existsSync(new URL(`./declarations/${name}.d.ts`, import.meta.url))
			).toBe(false);
			expect(
				fs.existsSync(
					new URL(`./declarations/${name}.d.ts.template`, import.meta.url)
				)
			).toBe(true);
		}
	});
});
