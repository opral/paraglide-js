import { Command, Option } from "commander";
import { Logger } from "../../../services/logger/index.js";
import { DEFAULT_PROJECT_PATH } from "../../../services/config/defaults.js";
import type { InitOptions } from "../../init-options.js";

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
					const { runInit } = await import("./command.js");
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
