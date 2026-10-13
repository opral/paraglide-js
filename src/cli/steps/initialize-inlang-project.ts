import {
	loadProjectFromDirectory,
	loadProjectInMemory,
	newProject,
	saveProjectToDirectory,
	type InlangProject,
} from "@inlang/sdk";
import type { Logger } from "../../services/logger/index.js";
import type { CliStep } from "../utils.js";
import { getNewProjectTemplate } from "../defaults.js";
import { DEFAULT_PROJECT_PATH } from "../../services/config/defaults.js";
import nodePath from "node:path";
import type fs from "node:fs";

export const initializeInlangProject: CliStep<
	{
		fs: typeof fs.promises;
		syncFs: typeof fs;
		logger: Logger;
		root: string;
		projectPath?: string;
	},
	{ project: InlangProject; projectPath: string }
> = async (ctx) => {
	const projectPath = nodePath.resolve(
		ctx.root,
		ctx.projectPath ?? DEFAULT_PROJECT_PATH
	);
	const existing = await ctx.fs
		.access(nodePath.join(projectPath, "settings.json"))
		.then(
			() => true,
			() => false
		);
	if (!existing)
		return { ...ctx, ...(await createNewProjectFlow({ ...ctx, projectPath })) };
	const project = await loadProjectFromDirectory({
		path: projectPath,
		fs: ctx.syncFs,
	});
	const errors = await project.errors.get();
	if (errors.length) {
		await project.close();
		throw new AggregateError(errors, "Existing inlang project has errors.");
	}
	ctx.logger.success("Using the existing inlang project.");
	return { ...ctx, project, projectPath };
};

export const createNewProjectFlow = async (ctx: {
	fs: typeof fs.promises;
	syncFs: typeof fs;
	logger: Logger;
	root?: string;
	projectPath?: string;
}): Promise<{ project: InlangProject; projectPath: string }> => {
	const root = ctx.root ?? process.cwd();
	const projectPath = nodePath.resolve(
		root,
		ctx.projectPath ?? DEFAULT_PROJECT_PATH
	);
	const settings = getNewProjectTemplate();
	// The SDK resolves message paths from the parent of the .inlang directory.
	const relativeMessages = nodePath
		.relative(
			nodePath.dirname(projectPath),
			nodePath.join(root, "messages", "{locale}.json")
		)
		.split(nodePath.sep)
		.join("/");
	settings["plugin.inlang.messageFormat"].pathPattern =
		relativeMessages.startsWith(".")
			? relativeMessages
			: "./" + relativeMessages;
	await ctx.fs.mkdir(nodePath.join(root, "messages"), { recursive: true });
	await Promise.all(
		settings.locales.map(async (locale) => {
			const file = nodePath.join(root, "messages", locale + ".json");
			try {
				await ctx.fs.writeFile(
					file,
					JSON.stringify(
						{
							$schema: "https://inlang.com/schema/inlang-message-format",
							example_message:
								locale === "en"
									? "Hello world {username}"
									: "Guten Tag {username}",
						},
						null,
						2
					),
					{ flag: "wx" }
				);
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
			}
		})
	);
	const temporary = await loadProjectInMemory({
		blob: await newProject({ settings }),
	});
	try {
		await saveProjectToDirectory({
			project: temporary,
			fs: ctx.fs,
			path: projectPath,
		});
	} finally {
		await temporary.close();
	}
	const project = await loadProjectFromDirectory({
		path: projectPath,
		fs: ctx.syncFs,
	});
	const errors = await project.errors.get();
	if (errors.length) {
		await project.close();
		throw new AggregateError(errors, "Failed to create the inlang project.");
	}
	ctx.logger.success("Created a new inlang project.");
	return { project, projectPath };
};

/**
 * Get's the common prefix of a set of strings.
 * If only one string is passed the prefix will be the empty string
 *
 * @example
 * ```ts
 * getCommonPrefix(["foo", "foobar"]) // "foo"
 * getCommonPrefix(["foobar"]) // ""
 * ```
 */
export function getCommonPrefix(strings: string[]): string {
	const strs = strings.filter(Boolean);
	if (strs.length <= 1) return "";

	const firstString = strs[0];
	if (firstString === undefined) {
		return "";
	}

	return strs.reduce(
		(commonPrefix, str) => longestCommonPrefix(commonPrefix, str),
		firstString
	);
}

function longestCommonPrefix(strA: string, strB: string): string {
	let commonPrefix = "";
	for (let i = 0; i < Math.min(strA.length, strB.length); i++) {
		if (strA[i] === strB[i]) {
			commonPrefix += strA[i];
		} else {
			break;
		}
	}
	return commonPrefix;
}

/**
 * Follows the IETF BCP 47 locale schema with modifications.
 */
export const pattern =
	"^((?<grandfathered>(en-GB-oed|i-ami|i-bnn|i-default|i-enochian|i-hak|i-klingon|i-lux|i-mingo|i-navajo|i-pwn|i-tao|i-tay|i-tsu|sgn-BE-FR|sgn-BE-NL|sgn-CH-DE)|(art-lojban|cel-gaulish|no-bok|no-nyn|zh-guoyu|zh-hakka|zh-min|zh-min-nan|zh-xiang))|((?<language>([A-Za-z]{2,3}(-(?<extlang>[A-Za-z]{3}(-[A-Za-z]{3}){0,2}))?))(-(?<script>[A-Za-z]{4}))?(-(?<region>[A-Za-z]{2}|[0-9]{3}))?(-(?<variant>[A-Za-z0-9]{5,8}|[0-9][A-Za-z0-9]{3}))*))$";

// const isValidlocale = (locale: string): boolean =>
// 	RegExp(`${pattern}`).test(locale);
