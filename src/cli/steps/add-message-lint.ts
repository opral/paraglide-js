import type fs from "node:fs/promises";
import nodePath from "node:path";
import { promptSelection } from "../utils.js";
import type { Logger } from "../../services/logger/index.js";
import { updatePackageJson } from "./update-package-json.js";

export type MessageLint = "none" | "eslint" | "oxlint";
export async function chooseMessageLint(ctx: {
	interactive: boolean;
	lint?: MessageLint;
}): Promise<MessageLint> {
	if (ctx.lint) return ctx.lint;
	if (!ctx.interactive) return "none";
	return promptSelection("Set up linting to guard message tree-shaking?", {
		initial: "none",
		options: [
			{ label: "Skip", value: "none" },
			{ label: "ESLint", value: "eslint" },
			{ label: "Oxlint", value: "oxlint" },
		],
	});
}

export function messageLintConfig(
	lint: Exclude<MessageLint, "none">,
	outdir: string
): { filename: string; source: string; command: string } {
	const directory = nodePath.basename(outdir);
	const rule = ["error", { messageModuleDirectories: [directory] }];
	if (lint === "oxlint")
		return {
			filename: ".oxlintrc.paraglide.json",
			source:
				JSON.stringify(
					{
						plugins: [],
						jsPlugins: [
							{ name: "paraglide", specifier: "@inlang/paraglide-js/eslint" },
						],
						ignorePatterns: [outdir.replace(/^\.\//, "") + "/**"],
						rules: { "paraglide/no-dynamic-message-access": rule },
					},
					null,
					2
				) + "\n",
			command: "oxlint --config ./.oxlintrc.paraglide.json .",
		};
	return {
		filename: "eslint.paraglide.config.mjs",
		source: `import paraglide from "@inlang/paraglide-js/eslint";
import tsParser from "@typescript-eslint/parser";

export default [
 { ignores: [${JSON.stringify(outdir.replace(/^\.\//, "") + "/**")}, "node_modules/**"] },
 {
  files: ["**/*.{js,jsx,mjs,cjs,ts,tsx,mts,cts}"],
  languageOptions: { parser: tsParser, parserOptions: { ecmaFeatures: { jsx: true } } },
  plugins: { paraglide },
  rules: { "paraglide/no-dynamic-message-access": ${JSON.stringify(rule)} },
 },
];
`,
		command: "eslint --config ./eslint.paraglide.config.mjs .",
	};
}

export async function preflightMessageLint(ctx: {
	fs: typeof fs;
	root: string;
	packageJsonPath: string;
	outdir: string;
	lint: MessageLint;
}) {
	if (ctx.lint === "none") return;
	const config = messageLintConfig(ctx.lint, ctx.outdir);
	const pkg = JSON.parse(await ctx.fs.readFile(ctx.packageJsonPath, "utf8"));
	if (pkg.scripts?.["lint:i18n"] && pkg.scripts["lint:i18n"] !== config.command)
		throw new Error(
			"An unrelated lint:i18n script exists. Rename it before setting up message linting."
		);
	const existing = await ctx.fs
		.readFile(nodePath.join(ctx.root, config.filename), "utf8")
		.catch((error: NodeJS.ErrnoException) => {
			if (error.code === "ENOENT") return undefined;
			throw error;
		});
	if (existing !== undefined && existing !== config.source)
		throw new Error(
			`${config.filename} already exists with different content; it will not be overwritten.`
		);
	const deps = { ...pkg.dependencies, ...pkg.devDependencies };
	const parserMajor = String(deps["@typescript-eslint/parser"] ?? "").match(
		/^(?:[~^]|>=)?(\d+)/
	)?.[1];
	if (ctx.lint === "eslint" && parserMajor && Number(parserMajor) < 8)
		throw new Error(
			"Message lint setup requires @typescript-eslint/parser 8 or later. Update the existing dependency first."
		);
	const major = String(deps.eslint ?? "").match(/^(?:[~^]|>=)?(\d+)/)?.[1];
	if (ctx.lint === "eslint" && major && Number(major) < 9)
		throw new Error(
			"Message linting requires ESLint 9 or 10. Update the existing ESLint dependency first."
		);
	const oxVersion = String(deps.oxlint ?? "").match(
		/^(?:[~^]|>=)?(\d+)\.(\d+)/
	);
	if (
		ctx.lint === "oxlint" &&
		oxVersion &&
		Number(oxVersion[1]) === 1 &&
		Number(oxVersion[2]) < 88
	)
		throw new Error(
			"Message lint setup requires Oxlint 1.88 or later. Update the existing dependency first."
		);
}

export async function addMessageLint(ctx: {
	fs: typeof fs;
	root: string;
	packageJsonPath: string;
	outdir: string;
	logger: Logger;
	lint: MessageLint;
}) {
	if (ctx.lint === "none") return ctx;
	await preflightMessageLint(ctx);
	const config = messageLintConfig(ctx.lint, ctx.outdir);
	await ctx.fs.writeFile(
		nodePath.join(ctx.root, config.filename),
		config.source
	);
	await updatePackageJson({
		devDependencies: async (deps) => {
			const pkg = JSON.parse(
				await ctx.fs.readFile(ctx.packageJsonPath, "utf8")
			);
			const known = { ...pkg.dependencies, ...deps };
			const needed =
				ctx.lint === "eslint"
					? { eslint: "^9.39.2", "@typescript-eslint/parser": "^8.71.2" }
					: { oxlint: "^1.88.0" };
			return {
				...deps,
				...Object.fromEntries(
					Object.entries(needed).filter(([name]) => !known[name])
				),
			};
		},
		scripts: async (scripts) => ({ ...scripts, "lint:i18n": config.command }),
	})(ctx);
	ctx.logger.success(
		`Added ${ctx.lint} message linting. After installing dependencies, run npm run lint:i18n. Existing lint configurations are unchanged.`
	);
	return ctx;
}
