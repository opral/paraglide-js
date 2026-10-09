import { toRelativeDisplayPath } from "../utils.js";

/**
 * The localization section `init` suggests adding to AGENTS.md. `init` only
 * prints it and never writes AGENTS.md.
 */
export function agentsMdSuggestion(args: {
	root: string;
	projectPath: string;
	/** The message files, e.g. `./messages/{locale}.json`. */
	pathPattern: string;
	outdir: string;
}): string {
	const projectPath = toRelativeDisplayPath(args.root, args.projectPath);
	const pathPattern = toRelativeDisplayPath(args.root, args.pathPattern);
	// an outdir of `./` is the root itself
	const outdir = toRelativeDisplayPath(args.root, args.outdir) || ".";
	return [
		"If you use coding agents, consider adding this to your AGENTS.md:",
		"",
		"## Localization",
		`- Translations are an inlang project. Before localization work, read \`${projectPath}/README.md\`. It covers checks, machine translation and editors. It is git-ignored, so search tools may skip it.`,
		`- Edit messages in \`${pathPattern}\`. Never edit \`${outdir}/\`: Paraglide JS generates it.`,
	].join("\n");
}
