import { createRequire } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

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

/**
 * Resolves the `tsc` CLI of TypeScript 7+ installed beside TypeScript 5/6
 * under the `@typescript/native` npm alias, as documented for
 * `svelte-check --tsgo`, or returns `undefined` when there is none.
 */
export function resolveNativeTscJsPath(): string | undefined {
	const require = createRequire(import.meta.url);
	try {
		// the working directory first, so that an app's alias is found in a
		// workspace without hoisting
		const packageJsonPath = require.resolve("@typescript/native/package.json", {
			paths: [process.cwd(), path.dirname(fileURLToPath(import.meta.url))],
		});
		const packageJson: unknown = JSON.parse(
			readFileSync(packageJsonPath, "utf-8")
		);
		const version =
			typeof packageJson === "object" &&
			packageJson !== null &&
			"version" in packageJson
				? packageJson.version
				: undefined;
		// the CLI of TypeScript 5/6 emits invalid quoted export aliases, which
		// only the compiler-API path corrects
		const isTypeScript7OrNewer =
			typeof version === "string" && Number.parseInt(version, 10) >= 7;
		const tscJsPath = path.join(path.dirname(packageJsonPath), "lib", "tsc.js");
		return isTypeScript7OrNewer && existsSync(tscJsPath)
			? tscJsPath
			: undefined;
	} catch {
		// an alias that can't be read leaves the other emit paths in place
		return undefined;
	}
}
