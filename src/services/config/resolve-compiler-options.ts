import {
	defaultCompilerOptions,
	type CompilerOptions,
} from "../../compiler/compiler-options.js";
import { resolve } from "node:path";
import type { ParaglideConfig } from "./config-schema.js";

/**
 * Merges configuration sources into a full set of compiler options.
 *
 * Precedence (highest last):
 * 1. built-in defaults (without `project`, `outdir`, `outputStructure`)
 * 2. `config` — values from a paraglide config file
 * 3. `overrides` — explicitly passed values, e.g. CLI flags or plugin options
 *
 * `undefined` values in `config` and `overrides` are ignored, so an absent
 * CLI flag or plugin option never shadows the config file. `project` and
 * `outdir` have no built-in defaults here — the CLI applies (and announces)
 * the conventional paths, while bundler plugins require them explicitly
 * (or via config file).
 */

export function resolveCompilerOptions(args: {
	config: ParaglideConfig | undefined;
	/** Directory used to resolve relative paths. */
	root?: string | undefined;
	overrides: Partial<Omit<CompilerOptions, "project">> & {
		project: string;
	};
}): CompilerOptions {
	const clonedDefaults = structuredClone(defaultsTemplate);
	const options: Partial<CompilerOptions> = {
		...clonedDefaults,
		...omitUndefinedEntries(args.config ?? {}),
		...omitUndefinedEntries(args.overrides ?? {}),
	};

	if (typeof options.project !== "string") {
		throw new Error(
			'The "project" option is required — the path to your inlang project directory (e.g. "./project.inlang").'
		);
	}
	if (typeof options.outdir !== "string") {
		throw new Error(
			'The "outdir" option is required — the path to the output directory (e.g. "./src/paraglide").'
		);
	}

	const resolved = options as CompilerOptions;
	if (args.root !== undefined) {
		resolved.project = resolve(args.root, resolved.project);
		resolved.outdir = resolve(args.root, resolved.outdir);
	}
	return resolved;
}

// `outputStructure` is deliberately NOT pinned here: its default differs
// per surface — bundler plugins switch to "locale-modules" in development
// (#486), while the CLI always uses "message-modules". Surfaces that need
// a pinned value pass it explicitly as an override.
// `project` and `outdir` have no built-in defaults here either: the CLI
// decides whether to apply (and announce) the conventional paths, while
// bundler plugins require them explicitly (or via config file).
const defaultsTemplate: Omit<
	CompilerOptions,
	"outputStructure" | "project" | "outdir"
> = (() => {
	const { outputStructure: _outputStructure, ...rest } =
		defaultCompilerOptions;
	return rest;
})();

function omitUndefinedEntries<T extends object>(object: T): T {
	return Object.fromEntries(
		Object.entries(object).filter(([, value]) => value !== undefined)
	) as T;
}
