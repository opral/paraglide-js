import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import path from "node:path";

/**
 * Resolves the path to the `tsc` CLI entry point of the installed
 * `typescript` package.
 *
 * Lives in its own module so tests can point the TypeScript 7 emit
 * path at a different TypeScript installation than the one the repo
 * itself depends on.
 */
export function resolveTscJsPath(): string {
	const require = createRequire(import.meta.url);
	const packageJsonPath = require.resolve("typescript/package.json");
	const tscJsPath = path.join(path.dirname(packageJsonPath), "lib", "tsc.js");
	// `lib/tsc.js` is internal package layout rather than a public export, so
	// fail with a pointed error if a future TypeScript version moves it.
	if (existsSync(tscJsPath) === false) {
		throw new Error(
			`Paraglide's "emitTsDeclarations" option could not locate TypeScript's "tsc" CLI at ${tscJsPath}. As a workaround, install TypeScript 5 or 6, or disable "emitTsDeclarations".`
		);
	}
	return tscJsPath;
}
