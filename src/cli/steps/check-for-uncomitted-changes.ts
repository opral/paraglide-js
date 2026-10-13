import type { Logger } from "../../services/logger/index.js";
import type { CliStep } from "../utils.js";
import { prompt } from "../utils.js";
import childProcess from "node:child_process";

export const checkForUncommittedChanges: CliStep<
	{
		logger: Logger;
		interactive?: boolean;
		allowDirty?: boolean;
		root?: string;
	},
	unknown
> = async (ctx) => {
	if (ctx.allowDirty) return ctx;
	let status: string;
	try {
		status = await execAsync("git status --porcelain", ctx.root);
	} catch {
		return ctx;
	}
	if (ctx.interactive === false && status.length > 0) {
		throw new Error(
			"Uncommitted changes found. Commit them or pass --allow-dirty to continue."
		);
	}
	try {
		if (status.length === 0) {
			return ctx;
		}

		ctx.logger.info(
			`You have uncommitted changes.\n\nCommitting outstanding changes ensures that you don't lose any work, and see the changes the paraglide-js init command introduces.`
		);
		const response = await prompt("Continue without committing?", {
			type: "confirm",
			initial: false,
		});
		if (response === true) {
			return ctx;
		} else {
			process.exit(0);
		}
	} catch {
		// git cli is not installed
		return ctx;
	}
};

function execAsync(command: string, cwd?: string) {
	return new Promise<string>((resolve, reject) => {
		childProcess.exec(command, { cwd }, (error, stdout) => {
			if (error) {
				reject(error);
			} else {
				resolve(stdout);
			}
		});
	});
}
