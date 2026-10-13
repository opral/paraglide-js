import JSON5 from "json5";
import path from "node:path";
import type { Logger } from "../../services/logger/index.js";
import type { CliStep } from "../utils.js";

export const addVitePlugin: CliStep<
	{
		fs: typeof import("node:fs/promises");
		projectPath: string;
		outdir: string;
		logger?: Logger;
		configPath: string;
	},
	unknown
> = async (ctx) => {
	try {
		const fileContent = await ctx.fs.readFile(ctx.configPath, {
			encoding: "utf-8",
		});

		const result = updateViteConfig({
			config: fileContent,
			projectPath: ctx.projectPath,
			outdir: ctx.outdir,
		});
		if (result.reason === "Already present") return ctx;
		if (result.ok) {
			await ctx.fs.writeFile(ctx.configPath, result.updated);
			ctx.logger?.success(
				"Added the Paraglide JS vite plugin to the vite config."
			);
		} else {
			const msg = [
				"Failed to add the Paraglide JS vite plugin in vite.config.js.",
				"Reason: " + result.reason,
				"",
				"Please add the plugin manually.",
			].join("\n");

			ctx.logger?.warn(msg);
			return ctx;
		}
	} catch {
		ctx.logger?.error(
			`Failed to add the Paraglide JS vite plugin to ${ctx.configPath}.`
		);
		process.exit(1);
	}

	return ctx;
};

type UpdateResult =
	| {
			ok: true;
			updated: string;
			reason?: undefined;
	  }
	| {
			ok: false;
			reason: string;
			updated?: undefined;
	  };

/**
 * @private Only exported for testings
 */
export function updateViteConfig(args: {
	config: string;
	projectPath: string;
	outdir: string;
}): UpdateResult {
	if (args.config.includes("@inlang/paraglide-js")) {
		const call = args.config.match(
			/\bparaglideVitePlugin\s*\(\s*\{([\s\S]*?)\}\s*\)/
		);
		if (!call)
			return {
				ok: false,
				reason: "Existing Paraglide import needs manual plugin integration",
			};
		try {
			const options = JSON5.parse("{" + call[1] + "}");
			if (
				typeof options.project !== "string" ||
				typeof options.outdir !== "string"
			)
				return {
					ok: false,
					reason: "Existing plugin paths must be configured explicitly",
				};
			if (
				path.resolve(options.project) !== path.resolve(args.projectPath) ||
				path.resolve(options.outdir) !== path.resolve(args.outdir)
			)
				return {
					ok: false,
					reason:
						"Existing Vite plugin paths differ from the requested project/outdir",
				};
			return { ok: false, reason: "Already present" };
		} catch {
			return {
				ok: false,
				reason: "Existing Vite plugin options cannot be verified automatically",
			};
		}
	}

	const PLUGINS_REGEX = /plugins\s*:\s*\[/g;
	const match = PLUGINS_REGEX.exec(args.config);

	if (!match) {
		return {
			ok: false,
			reason: "Could not find the plugins array",
		};
	}

	const endIndex = match.index + match[0].length;
	const before = args.config.slice(0, endIndex);
	const after = args.config.slice(endIndex);

	const updatedConfig =
		"import { paraglideVitePlugin } from '@inlang/paraglide-js'\n" +
		before +
		`paraglideVitePlugin({ project: ${JSON.stringify(args.projectPath)}, outdir: ${JSON.stringify(args.outdir)} }),` +
		after;

	return {
		ok: true,
		updated: updatedConfig,
	};
}
