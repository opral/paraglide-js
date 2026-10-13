import type { CliStep } from "../utils.js";
import type { Logger } from "../../services/logger/index.js";
import { prompt } from "../utils.js";
import JSON5 from "json5";
import { parseTree, modify, applyEdits, type ParseError } from "jsonc-parser";
import { pathExists } from "../../services/file-handling/exists.js";
import nodePath from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

export const maybeUpdateTsConfig: CliStep<
	{
		fs: typeof import("node:fs/promises");
		logger: Logger;
		interactive?: boolean;
		root?: string;
	},
	unknown
> = async (ctx) => {
	const ctx1 = await maybeUpdateTsConfigAllowJs(ctx);
	return ctx1;
	// return await maybeUpdateTsConfigModuleResolution(ctx1);
};

/**
 * Paraligde JS compiles to JS with JSDoc comments. TypeScript doesn't allow JS files by default.
 */
export const maybeUpdateTsConfigAllowJs: CliStep<
	{
		fs: typeof import("node:fs/promises");
		logger: Logger;
		interactive?: boolean;
		root?: string;
	},
	unknown
> = async (ctx) => {
	const configPath = nodePath.resolve(
		ctx.root ?? process.cwd(),
		"tsconfig.json"
	);
	if ((await pathExists(configPath, ctx.fs)) === false) {
		return ctx;
	}
	if (await hasAllowJsEnabled(configPath, ctx.fs)) {
		// all clear, allowJs is already set to true
		return ctx;
	}

	if (ctx.interactive === false) {
		const text = await ctx.fs.readFile(configPath, "utf8");
		await ctx.fs.writeFile(configPath, enableAllowJs(text));
		ctx.logger.success("Enabled compilerOptions.allowJs in tsconfig.json.");
		return ctx;
	}

	ctx.logger.info(
		`The option \`compilerOptions.allowJs\` needs to be set to \`true\` in the \`tsconfig.json\` file:

\`{
  "compilerOptions": {
    "allowJs": true
  }
}\``
	);
	let isValid = false;
	while (isValid === false) {
		const response = await prompt(
			`Is \`compilerOptions.allowJs\` set to \`true\`?`,
			{
				type: "confirm",
				initial: true,
			}
		);
		if (response === false) {
			ctx.logger.warn(
				"Continuing without adjusting the tsconfig.json. This may lead to type errors."
			);
			return ctx;
		}

		if (await hasAllowJsEnabled(configPath, ctx.fs)) {
			isValid = true;
			return ctx;
		} else {
			ctx.logger.error(
				"The compiler options has not been adjusted. Please sets `compilerOptions.allowJs` to `true`."
			);
		}
	}
	return ctx;
};

/**
 * Recursively checks whether allowJs is enabled in the provided tsconfig or any
 * referenced configuration files.
 *
 * @param tsconfigPath The path to the tsconfig to inspect.
 * @param fs The file system used to read the configs.
 * @param visited A set of already inspected files to avoid circular lookups.
 * @example
 * ```ts
 * await hasAllowJsEnabled("./tsconfig.json", fs);
 * ```
 */
export const hasAllowJsEnabled = async (
	tsconfigPath: string,
	fs: typeof import("node:fs/promises"),
	visited: Set<string> = new Set()
): Promise<boolean> => {
	const normalizedPath = normalizeConfigPath(tsconfigPath);

	if (visited.has(normalizedPath)) {
		return false;
	}

	visited.add(normalizedPath);

	const file = await fs.readFile(normalizedPath, { encoding: "utf-8" });
	const tsconfig = JSON5.parse(file);

	if (tsconfig?.compilerOptions?.allowJs === true) {
		return true;
	}

	const baseDir = nodePath.dirname(normalizedPath);

	const extendCandidates = Array.isArray(tsconfig?.extends)
		? tsconfig.extends
		: tsconfig?.extends
			? [tsconfig.extends]
			: [];

	for (const candidate of extendCandidates) {
		if (typeof candidate !== "string") continue;
		const resolved = await resolveExtendedConfig(candidate, baseDir, fs);
		if (resolved && (await hasAllowJsEnabled(resolved, fs, visited))) {
			return true;
		}
	}

	if (Array.isArray(tsconfig?.references)) {
		for (const reference of tsconfig.references) {
			const referencePath = reference?.path;
			if (typeof referencePath !== "string") continue;
			const resolved = await resolveReferenceConfig(referencePath, baseDir, fs);
			if (resolved && (await hasAllowJsEnabled(resolved, fs, visited))) {
				return true;
			}
		}
	}

	return false;
};

/**
 * Normalizes a tsconfig path to an absolute path.
 */
const normalizeConfigPath = (configPath: string): string => {
	return nodePath.isAbsolute(configPath)
		? configPath
		: nodePath.resolve(process.cwd(), configPath);
};

/**
 * Resolves the extended tsconfig path relative to the base config.
 */
const resolveExtendedConfig = async (
	extendsSpecifier: string,
	baseDir: string,
	fs: typeof import("node:fs/promises")
): Promise<string | undefined> => {
	const candidates = new Set<string>();
	const resolvedBase = nodePath.isAbsolute(extendsSpecifier)
		? extendsSpecifier
		: nodePath.resolve(baseDir, extendsSpecifier);
	candidates.add(resolvedBase);

	if (nodePath.extname(resolvedBase) === "") {
		candidates.add(`${resolvedBase}.json`);
		candidates.add(nodePath.join(resolvedBase, "tsconfig.json"));
	}

	for (const candidate of candidates) {
		if (await pathExists(candidate, fs)) {
			return candidate;
		}
	}

	try {
		return require.resolve(extendsSpecifier, { paths: [baseDir] });
	} catch {
		if (extendsSpecifier.endsWith(".json") === false) {
			try {
				return require.resolve(`${extendsSpecifier}.json`, {
					paths: [baseDir],
				});
			} catch {
				return undefined;
			}
		}
	}

	return undefined;
};

/**
 * Resolves the tsconfig referenced through the `references` property.
 */
const resolveReferenceConfig = async (
	referenceSpecifier: string,
	baseDir: string,
	fs: typeof import("node:fs/promises")
): Promise<string | undefined> => {
	const candidates = new Set<string>();
	const resolvedBase = nodePath.isAbsolute(referenceSpecifier)
		? referenceSpecifier
		: nodePath.resolve(baseDir, referenceSpecifier);
	candidates.add(resolvedBase);

	if (nodePath.extname(resolvedBase) === "") {
		candidates.add(`${resolvedBase}.json`);
		candidates.add(nodePath.join(resolvedBase, "tsconfig.json"));
	}

	for (const candidate of candidates) {
		if (await pathExists(candidate, fs)) {
			try {
				const stats = await fs.stat(candidate);
				if (stats.isDirectory()) {
					const directoryConfig = nodePath.join(candidate, "tsconfig.json");
					if (await pathExists(directoryConfig, fs)) {
						return directoryConfig;
					}
					continue;
				}
			} catch {
				// ignore, we'll continue checking other candidates
			}
			return candidate;
		}
	}

	return undefined;
};

// /**
//  * Ensures that the moduleResolution compiler option is set to "bundler" or similar in the tsconfig.json.
//  *
//  * Otherwise, types defined in `package.exports` are not resolved by TypeScript. Leading to type
//  * errors with Paraglide-JS.
//  */
// const maybeUpdateTsConfigModuleResolution: CliStep<
// 	{ fs: typeof import("node:fs/promises"); logger: Logger; interactive?: boolean; root?: string },
// 	unknown
// > = async (ctx) => {
// 	if ((await pathExists("./tsconfig.json", ctx.fs)) === false) {
// 		return ctx;
// 	}
// 	const file = await ctx.fs.readFile("./tsconfig.json", {
// 		encoding: "utf-8",
// 	});
// 	// tsconfig allows comments ... FML
// 	let tsconfig = JSON5.parse(file);

// 	let parentTsConfig: any | undefined;

// 	if (tsconfig.extends) {
// 		try {
// 			const parentTsConfigPath = nodePath.resolve(
// 				process.cwd(),
// 				tsconfig.extends
// 			);
// 			const parentTsConfigFile = await ctx.fs.readFile(parentTsConfigPath, {
// 				encoding: "utf-8",
// 			});
// 			parentTsConfig = JSON5.parse(parentTsConfigFile);
// 		} catch {
// 			ctx.logger.warn(
// 				`The tsconfig.json is extended from a tsconfig that couldn't be read. Maybe the file doesn't exist yet or is a NPM package. Continuing without taking the extended from tsconfig into consideration.`
// 			);
// 		}
// 	}

// 	// options that don't support package.exports
// 	const invalidOptions = ["classic", "node", "node10"];
// 	const moduleResolution =
// 		tsconfig.compilerOptions?.moduleResolution ??
// 		parentTsConfig?.compilerOptions?.moduleResolution;

// 	if (
// 		moduleResolution &&
// 		invalidOptions.includes(moduleResolution.toLowerCase()) === false
// 	) {
// 		// the moduleResolution is already set to bundler or similar
// 		return ctx;
// 	}

// 	ctx.logger.info(
// 		`The \`compilerOptions.moduleResolution\` options must be set to "Bundler" in the \`tsconfig.json\` file:

// \`{
//  "compilerOptions": {
//    "moduleResolution": "Bundler"
//  }
// }\``
// 	);
// 	let isValid = false;
// 	while (isValid === false) {
// 		const response = await prompt(
// 			`Is \`compilerOptions.moduleResolution\` set to "Bundler"?`,
// 			{
// 				type: "confirm",
// 				initial: true,
// 			}
// 		);
// 		if (response === false) {
// 			ctx.logger.warn(
// 				"Continuing without adjusting the tsconfig.json. This may lead to type errors."
// 			);
// 			return ctx;
// 		}

// 		// don't re-ask the question if there is an `extends` present in the tsconfig
// 		// just trust that it's correct.
// 		if (tsconfig.extends) {
// 			isValid = true;
// 			return ctx;
// 		}

// 		const file = await ctx.fs.readFile("./tsconfig.json", {
// 			encoding: "utf-8",
// 		});
// 		tsconfig = JSON5.parse(file);
// 		if (
// 			tsconfig?.compilerOptions?.moduleResolution &&
// 			tsconfig.compilerOptions.moduleResolution.toLowerCase() === "bundler"
// 		) {
// 			isValid = true;
// 			return ctx;
// 		} else {
// 			ctx.logger.error(
// 				"The compiler options have not been adjusted. Please set the `compilerOptions.moduleResolution` to `Bundler`."
// 			);
// 		}
// 	}

// 	return ctx;
// };

/** Edit one property while retaining comments and unrelated configuration text. */
export function enableAllowJs(text: string): string {
	const errors: ParseError[] = [];
	const tree = parseTree(text, errors, { allowTrailingComma: true });
	if (errors.length || tree?.type !== "object")
		throw new Error("tsconfig.json must be a valid JSON-with-comments object.");
	const indent = text.match(/\n([ \t]+)"/)?.[1] ?? "  ";
	return applyEdits(
		text,
		modify(text, ["compilerOptions", "allowJs"], true, {
			formattingOptions: {
				insertSpaces: !indent.includes("\t"),
				tabSize: indent.length,
				eol: text.includes("\r\n") ? "\r\n" : "\n",
			},
		})
	);
}
