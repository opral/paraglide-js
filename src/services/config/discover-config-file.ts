import { stat } from "node:fs/promises";
import { basename, join } from "node:path";

/**
 * Config file names that are resolved inside the project directory, in
 * order of precedence. Do not reorder without updating the documentation.
 */
export const CONFIG_FILE_NAMES = [
	"paraglide.config.js",
	"paraglide.config.mjs",
	"paraglide.config.ts",
	"paraglide.config.cjs",
] as const;

/**
 * Resolves the active paraglide config file inside a project directory.
 *
 * The config lives inside `<projectDir>` (the inlang project itself), so
 * there is no searching and no ambiguity: candidates are checked in
 * precedence order and the first existing file wins. Returns `undefined`
 * when no config file exists.
 */
export async function resolveConfigCandidate(
	projectDir: string
): Promise<string | undefined> {
	for (const fileName of CONFIG_FILE_NAMES) {
		const filePath = join(projectDir, fileName);
		// stat follows symlinks; a symlinked config is followed once and
		// validated to be a file.
		const stats = await stat(filePath).catch(() => undefined);
		if (stats?.isFile()) return filePath;
	}
	return undefined;
}

/**
 * Checks whether a changed path is one of the config file names. Used to
 * filter filesystem watch events in the project directory.
 */
export function isConfigFileName(path: string): boolean {
	return (CONFIG_FILE_NAMES as readonly string[]).includes(basename(path));
}
