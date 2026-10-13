import { Command, Option } from "commander";
import * as nodePath from "node:path";
import { Logger } from "../../../services/logger/index.js";
import { findPackageJson } from "../../../services/environment/package.js";
import { checkForUncommittedChanges } from "../../steps/check-for-uncomitted-changes.js";
import { initializeInlangProject } from "../../steps/initialize-inlang-project.js";
import { maybeAddSherlock } from "../../steps/maybe-add-sherlock.js";
import {
	maybeUpdateTsConfig,
	enableAllowJs,
} from "../../steps/update-ts-config.js";
import { promptForOutdir } from "../../steps/prompt-for-outdir.js";
import { updatePackageJson } from "../../steps/update-package-json.js";
import { shellArgument, type CliStep } from "../../utils.js";
import nodeFs from "node:fs";
import { ENV_VARIABLES } from "../../../services/env-variables/index.js";
import { detectBundler } from "../../steps/detect-bundler.js";
import { addVitePlugin } from "../../steps/add-vite-plugin.js";
import { compile } from "../../../compiler/compile.js";
import { maybeAddMachineTranslation } from "../../steps/maybe-add-machine-translation.js";
import { addInlangCheck } from "../../steps/add-inlang-check.js";
import { agentsMdSuggestion } from "../../steps/agents-md-suggestion.js";
import { getNewProjectTemplate } from "../../defaults.js";

import type { InitOptions } from "../../init-options.js";
import {
	addMessageLint,
	chooseMessageLint,
	preflightMessageLint,
} from "../../steps/add-message-lint.js";
import {
	DEFAULT_PROJECT_PATH,
	DEFAULT_OUTDIR,
} from "../../../services/config/defaults.js";
import { updateViteConfig } from "../../steps/add-vite-plugin.js";

export function createInitCommand() {
	return new Command()
		.name("init")
		.summary("Initializes Paraglide-JS.")
		.option(
			"-y, --yes",
			"Use defaults without prompts; optional editor, translation and lint tools are skipped"
		)
		.option("--non-interactive", "Alias for --yes; never open terminal prompts")
		.option("--allow-dirty", "Continue with uncommitted changes")
		.option(
			"--project <path>",
			"Inlang project to create or reuse",
			DEFAULT_PROJECT_PATH
		)
		.option("--outdir <path>", "Directory for generated messages")
		.addOption(
			new Option("--lint <tool>", "Optional message lint setup").choices([
				"none",
				"eslint",
				"oxlint",
			])
		)
		.option("--no-check", "Skip adding inlang check")
		.option("--sherlock", "Add the editor recommendation")
		.option("--no-sherlock", "Skip the editor recommendation")
		.option("--machine-translation", "Add a machine-translate script")
		.option("--no-machine-translation", "Skip the machine-translate script")
		.option(
			"--no-compile",
			"Skip the initial compilation; compile after installing dependencies"
		)
		.action(
			async (options: InitOptions & { compile: boolean }, command: Command) => {
				try {
					await runInit({
						...options,
						sherlock:
							command.getOptionValueSource("sherlock") === "cli"
								? options.sherlock
								: undefined,
						machineTranslation:
							command.getOptionValueSource("machineTranslation") === "cli"
								? options.machineTranslation
								: undefined,
					});
				} catch (error) {
					new Logger({ silent: false, prefix: false }).error(
						error instanceof Error ? error.message : String(error)
					);
					process.exitCode = 1;
				}
			}
		);
}

export const initCommand = createInitCommand();

export async function runInit(options: InitOptions & { compile?: boolean }) {
	const interactive = !(options.yes || options.nonInteractive);
	if (interactive && (!process.stdin.isTTY || !process.stdout.isTTY))
		throw new Error(
			"init needs a terminal. Use --yes (or --non-interactive) for unattended setup; no files were changed."
		);
	const logger = new Logger({ silent: false, prefix: false });
	const root = process.cwd();
	const projectPath = nodePath.resolve(
		root,
		options.project ?? DEFAULT_PROJECT_PATH
	);
	const outdir = nodePath.resolve(root, options.outdir ?? DEFAULT_OUTDIR);
	const contains = (parent: string, child: string) => {
		const relative = nodePath.relative(parent, child);
		return (
			relative === "" ||
			(!relative.startsWith(".." + nodePath.sep) &&
				relative !== ".." &&
				!nodePath.isAbsolute(relative))
		);
	};
	if (!options.project?.trim() && options.project !== undefined)
		throw new Error("--project must not be empty.");
	if (!options.outdir?.trim() && options.outdir !== undefined)
		throw new Error("--outdir must not be empty.");
	if (
		contains(outdir, root) ||
		contains(projectPath, root) ||
		contains(outdir, projectPath) ||
		contains(projectPath, outdir)
	)
		throw new Error(
			"Project and output directories must be distinct and must not contain the package root or each other."
		);
	const ctx = {
		logger,
		fs: nodeFs.promises,
		syncFs: nodeFs,
		root,
		interactive,
		allowDirty: options.allowDirty,
		projectPath,
		outdir: options.outdir
			? "./" + nodePath.relative(root, outdir).split(nodePath.sep).join("/")
			: undefined,
		sherlock: options.sherlock,
		machineTranslation: options.machineTranslation,
	};
	await checkForUncommittedChanges(ctx);
	const ctx2 = await enforcePackageJsonExists(ctx);
	const pkg = JSON.parse(await ctx.fs.readFile(ctx2.packageJsonPath, "utf8"));
	if (!pkg || typeof pkg !== "object" || Array.isArray(pkg))
		throw new Error("package.json must contain a JSON object.");
	for (const field of ["scripts", "dependencies", "devDependencies"])
		if (
			pkg[field] !== undefined &&
			(!pkg[field] ||
				typeof pkg[field] !== "object" ||
				Array.isArray(pkg[field]))
		)
			throw new Error(`package.json ${field} must be an object.`);
	// Validate collisions before creating projects or changing dependencies.
	const settingsExist = await nodeFs.promises
		.access(nodePath.join(projectPath, "settings.json"))
		.then(
			() => true,
			() => false
		);
	if (!settingsExist) {
		const contents = await nodeFs.promises
			.readdir(projectPath)
			.catch((error: NodeJS.ErrnoException) => {
				if (error.code === "ENOENT") return [];
				throw error;
			});
		if (contents.length)
			throw new Error(
				"The selected project directory is nonempty and has no settings.json; it will not be overwritten."
			);
	}
	if (!interactive) {
		const text = await nodeFs.promises
			.readFile(nodePath.join(root, "tsconfig.json"), "utf8")
			.catch((error: NodeJS.ErrnoException) => {
				if (error.code === "ENOENT") return undefined;
				throw error;
			});
		if (text !== undefined) enableAllowJs(text);
	}
	const ctx4 = await promptForOutdir(ctx2);
	const normalizedOutput =
		"./" +
		nodePath
			.relative(root, nodePath.resolve(root, ctx4.outdir))
			.split(nodePath.sep)
			.join("/");
	const chosenOutput = nodePath.resolve(root, ctx4.outdir);
	if (
		contains(chosenOutput, root) ||
		contains(chosenOutput, projectPath) ||
		contains(projectPath, chosenOutput)
	)
		throw new Error(
			"Output must not contain the package root or overlap the inlang project."
		);
	const lint = await chooseMessageLint({ ...ctx4, lint: options.lint });
	await preflightMessageLint({ ...ctx4, outdir: normalizedOutput, lint });
	const detected = await detectBundler(ctx4);
	if (!interactive && detected.bundler === "vite") {
		const config = await ctx.fs.readFile(detected.configPath, "utf8");
		const result = updateViteConfig({
			config,
			projectPath:
				"./" +
				nodePath.relative(root, projectPath).split(nodePath.sep).join("/"),
			outdir: normalizedOutput,
		});
		if (!result.ok && result.reason !== "Already present")
			throw new Error(
				"Vite configuration cannot be updated automatically: " +
					result.reason +
					". Add the plugin manually before rerunning init."
			);
	}
	if (interactive) logger.box("Welcome to Paraglide JS 🪂");
	const initialized = await initializeInlangProject({
		...ctx4,
		outdir: normalizedOutput,
	});
	const portable = {
		...initialized,
		projectPath:
			"./" +
			nodePath
				.relative(root, initialized.projectPath)
				.split(nodePath.sep)
				.join("/"),
		lint,
	};
	try {
		const ctx5 = await addParaglideJsToDevDependencies(portable);
		const ctx6 = await detectBundler(ctx5);
		if (ctx6.bundler === "vite") await addVitePlugin(ctx6);
		else await addCompileStepToPackageJSON(ctx6);
		const ctx7 = await maybeUpdateTsConfig(ctx6);
		const ctx8 = await maybeAddSherlock(ctx7);
		if (options.check !== false) await addInlangCheck(ctx8);
		const ctx9 = await maybeAddMachineTranslation(ctx8);
		await addMessageLint({ ...ctx9, lint });
		if (options.compile !== false) {
			try {
				await compile({
					project: ctx9.projectPath,
					outdir: ctx9.outdir,
					cleanOutdir: false,
				});
				logger.success("Ran the paraglide compiler");
			} catch (error) {
				if (!interactive)
					throw new Error(
						"Setup files were written, but compilation failed. Install dependencies and rerun init or compile. Cause: " +
							(error instanceof Error ? error.message : String(error))
					);
				logger.warn(
					"Failed to compile automatically. Install dependencies and run the compiler manually."
				);
			}
		}
		logger.success(
			"Setup complete! Install dependencies, then run your build" +
				(lint !== "none" ? " and lint:i18n." : ".")
		);
		const settings = await ctx9.project.settings.get();
		const pattern = settings["plugin.inlang.messageFormat"]?.pathPattern;
		process.stdout.write(
			agentsMdSuggestion({
				root,
				projectPath: ctx9.projectPath,
				outdir: ctx9.outdir,
				pathPattern:
					typeof pattern === "string"
						? nodePath
								.relative(
									root,
									nodePath.resolve(
										nodePath.dirname(nodePath.resolve(root, ctx9.projectPath)),
										pattern
									)
								)
								.split(nodePath.sep)
								.join("/")
						: getNewProjectTemplate()["plugin.inlang.messageFormat"]
								.pathPattern,
			}) + "\n"
		);
	} finally {
		await initialized.project.close();
	}
}

const addParaglideJsToDevDependencies: CliStep<
	{
		fs: typeof import("node:fs/promises");
		logger: Logger;
		packageJsonPath: string;
	},
	unknown
> = async (ctx) => {
	const ctx1 = await updatePackageJson({
		devDependencies: async (devDeps) => {
			const pkg = JSON.parse(
				await ctx.fs.readFile(ctx.packageJsonPath, "utf8")
			);
			if (
				pkg.dependencies?.["@inlang/paraglide-js"] ||
				devDeps["@inlang/paraglide-js"]
			)
				return devDeps;
			return {
				...devDeps,
				"@inlang/paraglide-js": `^${ENV_VARIABLES.PARJS_PACKAGE_VERSION}`,
			};
		},
	})(ctx);
	ctx.logger.success(
		"Added @inlang/paraglide-js to the devDependencies in package.json."
	);
	return ctx1;
};

const enforcePackageJsonExists: CliStep<
	{ logger: Logger; fs: typeof import("node:fs/promises") },
	{ packageJsonPath: string }
> = async (ctx) => {
	const packageJsonPath = await findPackageJson(ctx.fs, process.cwd());
	if (!packageJsonPath) {
		ctx.logger.warn(
			"No package.json found in the current working directory. Please change the working directory to the directory with a package.json file."
		);
		throw new Error("No package.json found in the current working directory.");
	}
	return { ...ctx, packageJsonPath };
};

const addCompileStepToPackageJSON: CliStep<
	{
		fs: typeof import("node:fs/promises");
		logger: Logger;
		projectPath: string;
		outdir: string;
		packageJsonPath: string;
	},
	unknown
> = async (ctx) => {
	const projectPath = shellArgument(
		"./" + nodePath.relative(process.cwd(), nodePath.resolve(ctx.projectPath))
	);
	const outdir = shellArgument(
		"./" + nodePath.relative(process.cwd(), nodePath.resolve(ctx.outdir))
	);

	ctx = await updatePackageJson({
		scripts: async (scripts) => {
			if (scripts.build === undefined) {
				scripts.build = `paraglide-js compile --project ${projectPath} --outdir ${outdir}`;
			} else if (scripts.build.includes("paraglide-js compile") === false) {
				scripts.build = `paraglide-js compile --project ${projectPath} --outdir ${outdir} && ${scripts.build}`;
			} else {
				return scripts;
			}

			ctx.logger.success(
				"Added the compile command to the build step in package.json."
			);
			ctx.logger.info(
				`Visit https://paraglidejs.com/compiling-messages for more information.`
			);
			return scripts;
		},
	})(ctx);

	return ctx;
};
