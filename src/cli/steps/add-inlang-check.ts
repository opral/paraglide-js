import type { Logger } from "../../services/logger/index.js";
import { toRelativeDisplayPath, type CliStep } from "../utils.js";
import { updatePackageJson } from "./update-package-json.js";

/**
 * The `@inlang/cli` range `init` adds. 3.4.0 introduced `inlang check`.
 */
export const INLANG_CLI_VERSION_RANGE = "^3.4.0";

export const CHECK_SCRIPT_NAME = "check:i18n";

/**
 * Adds `@inlang/cli` to the devDependencies (if not present) and a
 * `check:i18n` script that runs `inlang check` (if no script of that name
 * exists).
 */
export const addInlangCheck: CliStep<
	{
		fs: typeof import("node:fs/promises");
		logger: Logger;
		projectPath: string;
		root: string;
		packageJsonPath: string;
	},
	unknown
> = async (ctx) => {
	const projectPath = toRelativeDisplayPath(ctx.root, ctx.projectPath);
	let addedScript = false;

	await updatePackageJson({
		devDependencies: async (devDeps) => {
			if (devDeps["@inlang/cli"]) return devDeps;
			return { ...devDeps, "@inlang/cli": INLANG_CLI_VERSION_RANGE };
		},
		scripts: async (scripts) => {
			if (scripts[CHECK_SCRIPT_NAME]) return scripts;
			addedScript = true;
			return {
				...scripts,
				[CHECK_SCRIPT_NAME]: `inlang check --project ./${projectPath}`,
			};
		},
	})(ctx);

	if (addedScript) {
		ctx.logger.success(
			`Added @inlang/cli and a ${CHECK_SCRIPT_NAME} script that checks the translations to package.json.`
		);
	}

	return ctx;
};
