import { compileBundle } from "./compile-bundle.js";
import { selectBundleNested, type InlangProject } from "@inlang/sdk";
import { lookup } from "../services/lookup.js";
import * as localeModules from "./output-structure/locale-modules.js";
import * as messageModules from "./output-structure/message-modules.js";
import {
	defaultCompilerOptions,
	type CompilerOptions,
} from "./compiler-options.js";
import { createRuntimeFile } from "./runtime/create-runtime.js";
import { createServerFile } from "./server/create-server-file.js";
import { createRegistry } from "./registry.js";
import { emitTsDeclarations } from "./emit-ts-declarations.js";
import { createReadme } from "./create-readme.js";

const outputStructures = {
	"locale-modules": localeModules,
	"message-modules": messageModules,
};

/**
 * Takes an inlang project and compiles it into a set of files.
 *
 * Use this function for more programmatic control than `compile()`.
 * You can adjust the output structure and get the compiled files as a return value.
 *
 * @example
 *   const output = await compileProject({ project, projectPath: "./project.inlang" });
 *   await writeOutput('path', output, fs.promises);
 */
export const compileProject = async (args: {
	project: InlangProject;
	projectPath?: string;
	compilerOptions?: Omit<CompilerOptions, "fs" | "project" | "outdir">;
}): Promise<Record<string, string>> => {
	const optionsWithDefaults = {
		...defaultCompilerOptions,
		...args.compilerOptions,
	};
	await ensureURLPatternAvailable();
	validateRouteStrategyMatchers(optionsWithDefaults.routeStrategies);

	const settings = await args.project.settings.get();
	const bundles = await selectBundleNested(args.project.db).execute();

	//Maps each language to it's fallback
	//If there is no fallback, it will be undefined
	const fallbackMap = getFallbackMap(settings.locales, settings.baseLocale);

	const outputStructure = outputStructures[optionsWithDefaults.outputStructure];

	const compiledBundles = bundles.map((bundle) =>
		compileBundle({
			bundle,
			fallbackMap,
			messageReferenceExpression: outputStructure.messageReferenceExpression,
			settings,
			experimentalMiddlewareLocaleSplitting:
				optionsWithDefaults.experimentalMiddlewareLocaleSplitting,
			experimentalStaticLocale:
				optionsWithDefaults.outputStructure === "message-modules"
					? optionsWithDefaults.experimentalStaticLocale
					: undefined,
		})
	);

	const output: Record<string, string> = {
		["runtime.js"]: createRuntimeFile({
			baseLocale: settings.baseLocale,
			locales: settings.locales,
			compilerOptions: optionsWithDefaults,
		}),
		["server.js"]: createServerFile({
			compiledBundles,
			compilerOptions: optionsWithDefaults,
		}),
		["registry.js"]: createRegistry(),
		["messages.js"]: [
			"export * from './messages/_index.js'",
			"// enabling auto-import by exposing all messages as m",
			"export * as m from './messages/_index.js'",
		].join("\n"),
	};

	// generate the output modules
	Object.assign(
		output,
		outputStructure.generateOutput(
			compiledBundles,
			settings,
			fallbackMap,
			optionsWithDefaults.experimentalMiddlewareLocaleSplitting
		)
	);

	if (optionsWithDefaults.emitGitIgnore) {
		output[".gitignore"] = ignoreDirectory;
	}

	if (optionsWithDefaults.emitPrettierIgnore) {
		output[".prettierignore"] = ignoreDirectory;
	}

	if (optionsWithDefaults.emitReadme) {
		output["README.md"] = createReadme({ projectPath: args.projectPath });
	}

	// Declare the generated message modules side-effect-free so bundlers can drop
	// unused re-exports from the `m` barrel per entry, instead of bundling every
	// message used anywhere in the app into one shared chunk that every entry
	// downloads. Scoped to `messages/` so `runtime.js` (one level up, which has
	// real side effects) is unaffected. Only relevant for `message-modules`,
	// the structure with the re-export barrel.
	//
	// `type: "module"` is required: this package.json creates a new module scope
	// for `messages/`, and a package.json without a `type` field defaults to
	// CommonJS in Node — even when the consuming project is `type: "module"`.
	// Without it, the generated ESM `.js` files in `messages/` would be treated
	// as CommonJS and fail to resolve.
	// See https://github.com/opral/paraglide-js/issues/668
	if (optionsWithDefaults.outputStructure === "message-modules") {
		output["messages/package.json"] =
			JSON.stringify({ type: "module", sideEffects: false }, undefined, "\t") +
			"\n";
	}

	for (const [filename, content] of Object.entries(
		optionsWithDefaults.additionalFiles ?? {}
	)) {
		output[filename] = content;
	}

	for (const [filename, content] of Object.entries(output)) {
		if (optionsWithDefaults.includeEslintDisableComment) {
			if (filename.endsWith(".js")) {
				output[filename] = `/* eslint-disable */\n${content}`;
			}
		}
	}

	if (optionsWithDefaults.emitTsDeclarations) {
		const declarations = await emitTsDeclarations(output);
		Object.assign(output, declarations);
	}

	return output;
};

export function getFallbackMap<T extends string>(
	locales: T[],
	baseLocale: NoInfer<T>
): Record<T, T | undefined> {
	return Object.fromEntries(
		locales.map((lang) => {
			if (lang === baseLocale) return [lang, undefined];
			const fallbackLanguage = lookup(lang, {
				locales: locales.filter((l) => l !== lang),
				baseLocale,
			});

			if (lang === fallbackLanguage) return [lang, undefined];
			else return [lang, fallbackLanguage];
		})
	) as Record<T, T | undefined>;
}

const ignoreDirectory = `# ignore everything because the directory is auto-generated by inlang paraglide-js
# for more info visit https://paraglidejs.com
*
`;

async function ensureURLPatternAvailable() {
	try {
		new URLPattern({ pathname: "/:path(.*)?" });
	} catch {
		await import("urlpattern-polyfill");
	}
}

function validateRouteStrategyMatchers(
	routeStrategies: CompilerOptions["routeStrategies"]
) {
	if (!routeStrategies?.length) {
		return;
	}

	for (const [index, routeStrategy] of routeStrategies.entries()) {
		try {
			new URLPattern(routeStrategy.match, "https://example.com");
		} catch (error) {
			const details = error instanceof Error ? error.message : String(error);
			throw new Error(
				`Invalid routeStrategies[${index}].match "${routeStrategy.match}". URLPattern parsing failed: ${details}`
			);
		}
	}
}
