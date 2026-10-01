import { join } from "node:path";
import type nodeFs from "node:fs/promises";
import { CONFIG_FILE_NAMES } from "../config/discover-config-file.js";

/**
 * The SDK generates a project .gitignore that only allows settings.json.
 * Run after loading the project, since SDK upgrades can rewrite that file.
 */
export async function ensureConfigIsTracked(args: {
	projectDir: string;
	fs: typeof nodeFs;
}): Promise<void> {
	const gitignorePath = join(args.projectDir, ".gitignore");
	const content = await args.fs.readFile(gitignorePath, "utf8");
	const exceptions = CONFIG_FILE_NAMES.map((name) => `!${name}`);
	const lines = content.split(/\r?\n/);
	// Check the suffix so later ignore rules cannot override our exceptions.
	if (
		lines.slice(-exceptions.length - 1).join("\n") ===
		[...exceptions, ""].join("\n")
	) {
		return;
	}
	await args.fs.appendFile(
		gitignorePath,
		`${content.endsWith("\n") ? "" : "\n"}# Keep Paraglide configuration in version control\n${exceptions.join("\n")}\n`
	);
}
