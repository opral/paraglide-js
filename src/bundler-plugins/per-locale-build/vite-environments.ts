import nodeFs from "node:fs/promises";
import nodePath from "node:path";
import type { EnvironmentOptions, Plugin, UserConfig, ViteBuilder } from "vite";
import { PER_LOCALE_BUILD_DEFINE } from "./constants.js";
import { getPerLocaleBuildLocaleId } from "./locale-id.js";
import type { PerLocaleBuildSettings } from "./types.js";

export const VITE_LOCALE_BUILD_MANIFEST = "paraglide-vite-locales.json";
export const VITE_LOCALE_ENVIRONMENT_PREFIX = "paraglide_client_";

export type ViteLocaleBuildPlan = {
	outputDirectory: string;
	variants: Array<{
		locale: string;
		environmentName: string;
		directory: string;
		outputDirectory: string;
		define: Record<string, string>;
	}>;
};

export type ViteLocaleBuildManifest = {
	version: 1;
	backend: "vite-rolldown-environments";
	viteVersion: string;
	rolldownVersion: string;
	baseLocale: string;
	locales: Record<
		string,
		{
			environment: string;
			directory: string;
			entries: Record<string, string>;
			files: Array<{
				fileName: string;
				type: "asset" | "chunk";
				bytes: number;
				entry?: boolean;
				dynamicEntry?: boolean;
				imports?: string[];
				dynamicImports?: string[];
				externalImports?: string[];
				externalDynamicImports?: string[];
			}>;
		}
	>;
};

type ViteBuildResult = Awaited<ReturnType<ViteBuilder["build"]>>;
type ViteRolldownOutput = Extract<
	ViteBuildResult extends Array<infer Item> ? Item : ViteBuildResult,
	{ output: unknown[] }
>;

export function createViteLocaleBuildPlan(args: {
	settings: PerLocaleBuildSettings;
	outputDirectory?: string;
}): ViteLocaleBuildPlan {
	const outputDirectory = normalizeOutputDirectory(
		args.outputDirectory ?? "dist"
	);
	return {
		outputDirectory,
		variants: args.settings.locales.map((locale) => {
			const localeId = getPerLocaleBuildLocaleId(locale);
			const directory = nodePath.posix.join("__paraglide", localeId);
			return {
				locale,
				environmentName: `${VITE_LOCALE_ENVIRONMENT_PREFIX}${localeId.replaceAll(/[^a-zA-Z0-9_$]/g, "_")}`,
				directory,
				outputDirectory: nodePath.posix.join(outputDirectory, directory),
				define: {
					[PER_LOCALE_BUILD_DEFINE]: JSON.stringify(locale),
				},
			};
		}),
	};
}

/**
 * Build one untouched Rolldown client graph per locale.
 *
 * This plugin owns app-build orchestration. It deliberately rejects another
 * custom buildApp orchestrator rather than guessing how a framework builds.
 */
export function createViteLocaleEnvironmentPlugin(args: {
	settings: () => Promise<PerLocaleBuildSettings>;
	outputDirectory?: string;
}): Plugin {
	let plan: ViteLocaleBuildPlan | undefined;
	let settings: PerLocaleBuildSettings | undefined;
	let buildApp:
		| NonNullable<NonNullable<UserConfig["builder"]>["buildApp"]>
		| undefined;

	return {
		name: "paraglide-vite-locale-environments",
		enforce: "post",
		async config(config, env) {
			if (env.command !== "build") return;
			// Vite is an optional peer dependency. Only resolve it when this
			// experimental Vite-specific build path is actually used so importing
			// the package's compiler API does not require Vite to be installed.
			const vite = await import("vite");
			const viteVersion = vite.version;
			const detectedRolldownVersion = (
				vite as unknown as { rolldownVersion?: unknown }
			).rolldownVersion;
			if (Number.parseInt(viteVersion, 10) < 8) {
				throw new Error(
					`experimentalPerLocaleBuild Vite environments require Vite 8 or newer; found ${viteVersion}.`
				);
			}
			if (config.builder?.buildApp !== undefined) {
				throw new Error(
					"experimentalPerLocaleBuild Vite environments cannot compose with an existing builder.buildApp orchestrator. A framework must expose a public client-variant API before using this backend."
				);
			}
			settings = await args.settings();
			validateViteLocaleBuildSettings(settings);
			plan = createViteLocaleBuildPlan({
				settings,
				outputDirectory: args.outputDirectory ?? config.build?.outDir,
			});
			for (const variant of plan.variants) {
				if (config.environments?.[variant.environmentName] !== undefined) {
					throw new Error(
						`experimentalPerLocaleBuild cannot create Vite environment ${JSON.stringify(variant.environmentName)} because the application already defines it.`
					);
				}
			}
			buildApp = async (builder) => {
				await buildViteLocaleEnvironments({
					builder,
					plan: plan!,
					settings: settings!,
					viteVersion,
					rolldownVersion:
						typeof detectedRolldownVersion === "string"
							? detectedRolldownVersion
							: "unknown",
				});
			};
			return {
				builder: {
					...config.builder,
					buildApp,
				},
				environments: Object.fromEntries(
					plan.variants.map((variant) => [
						variant.environmentName,
						createLocaleEnvironment(variant),
					])
				),
			} satisfies UserConfig;
		},
		configResolved(config) {
			if (config.command !== "build") return;
			if (config.builder?.buildApp !== buildApp) {
				throw new Error(
					"experimentalPerLocaleBuild Vite environments must own builder.buildApp. Another plugin replaced the locale build orchestrator."
				);
			}
		},
		buildStart() {
			if (!this.meta.rolldownVersion) {
				throw new Error(
					"experimentalPerLocaleBuild Vite environments require a Rolldown-powered Vite build (Vite 8 or newer)."
				);
			}
		},
	};
}

function createLocaleEnvironment(
	variant: ViteLocaleBuildPlan["variants"][number]
): EnvironmentOptions {
	return {
		consumer: "client",
		define: variant.define,
		build: {
			outDir: variant.outputDirectory,
			emptyOutDir: true,
			manifest: true,
		},
	};
}

async function buildViteLocaleEnvironments(args: {
	builder: ViteBuilder;
	plan: ViteLocaleBuildPlan;
	settings: PerLocaleBuildSettings;
	viteVersion: string;
	rolldownVersion: string;
}): Promise<void> {
	const outputRoot = nodePath.resolve(
		args.builder.config.root,
		args.plan.outputDirectory
	);
	await Promise.all([
		nodeFs.rm(nodePath.join(outputRoot, "__paraglide"), {
			recursive: true,
			force: true,
		}),
		nodeFs.rm(nodePath.join(outputRoot, VITE_LOCALE_BUILD_MANIFEST), {
			force: true,
		}),
	]);

	const results: Array<{
		variant: ViteLocaleBuildPlan["variants"][number];
		outputs: ViteRolldownOutput[];
	}> = [];
	for (const variant of args.plan.variants) {
		const environment = args.builder.environments[variant.environmentName];
		if (!environment) {
			throw new Error(
				`Vite did not create the locale environment ${JSON.stringify(variant.environmentName)}.`
			);
		}
		const result = await args.builder.build(environment);
		results.push({
			variant,
			outputs: getRolldownOutputs(result),
		});
	}

	const manifest: ViteLocaleBuildManifest = {
		version: 1,
		backend: "vite-rolldown-environments",
		viteVersion: args.viteVersion,
		rolldownVersion: args.rolldownVersion,
		baseLocale: args.settings.baseLocale,
		locales: {},
	};
	for (const { variant, outputs } of results) {
		manifest.locales[variant.locale] = createLocaleManifest({
			variant,
			outputs,
		});
	}

	await nodeFs.mkdir(outputRoot, { recursive: true });
	await nodeFs.writeFile(
		nodePath.join(outputRoot, VITE_LOCALE_BUILD_MANIFEST),
		JSON.stringify(manifest, undefined, "\t") + "\n"
	);
}

function getRolldownOutputs(result: ViteBuildResult): ViteRolldownOutput[] {
	if (Array.isArray(result)) {
		return result.filter(
			(item): item is ViteRolldownOutput => "output" in item
		);
	}
	if ("output" in result) return [result as ViteRolldownOutput];
	throw new Error(
		"experimentalPerLocaleBuild Vite environments do not support watch-mode Rolldown output."
	);
}

function createLocaleManifest(args: {
	variant: ViteLocaleBuildPlan["variants"][number];
	outputs: ViteRolldownOutput[];
}): ViteLocaleBuildManifest["locales"][string] {
	const outputFiles = args.outputs.flatMap((output) => output.output);
	const emittedFileNames = new Set(
		outputFiles.map((output) => output.fileName)
	);
	const files: ViteLocaleBuildManifest["locales"][string]["files"] = outputFiles
		.map((output) => {
			if (output.type === "asset") {
				return {
					fileName: output.fileName,
					type: "asset" as const,
					bytes: getByteLength(output.source),
				};
			}
			const staticImports = partitionImports(output.imports, emittedFileNames);
			const dynamicImports = partitionImports(
				output.dynamicImports,
				emittedFileNames
			);
			return {
				fileName: output.fileName,
				type: "chunk" as const,
				bytes: getByteLength(output.code),
				...(output.isEntry ? { entry: true } : {}),
				...(output.isDynamicEntry ? { dynamicEntry: true } : {}),
				...(staticImports.internal.length > 0
					? { imports: staticImports.internal }
					: {}),
				...(dynamicImports.internal.length > 0
					? { dynamicImports: dynamicImports.internal }
					: {}),
				...(staticImports.external.length > 0
					? { externalImports: staticImports.external }
					: {}),
				...(dynamicImports.external.length > 0
					? {
							externalDynamicImports: dynamicImports.external,
						}
					: {}),
			};
		})
		.sort((left, right) => left.fileName.localeCompare(right.fileName));
	const fileNames = new Set(files.map((file) => file.fileName));
	for (const file of files) {
		for (const imported of [
			...(file.imports ?? []),
			...(file.dynamicImports ?? []),
		]) {
			if (!fileNames.has(imported)) {
				throw new Error(
					`Vite emitted an open locale graph for ${JSON.stringify(args.variant.locale)}: ${file.fileName} imports missing ${imported}.`
				);
			}
		}
	}
	const entryPairs: Array<[string, string]> = [];
	for (const output of args.outputs.flatMap((result) => result.output)) {
		if (output.type === "chunk" && output.isEntry) {
			entryPairs.push([output.facadeModuleId ?? output.name, output.fileName]);
		}
	}
	const entries = Object.fromEntries(
		entryPairs.sort(([left], [right]) => left.localeCompare(right))
	);
	return {
		environment: args.variant.environmentName,
		directory: args.variant.directory,
		entries,
		files,
	};
}

function partitionImports(
	imports: string[],
	emittedFileNames: ReadonlySet<string>
): { internal: string[]; external: string[] } {
	const internal: string[] = [];
	const external: string[] = [];
	for (const imported of imports) {
		(emittedFileNames.has(imported) ? internal : external).push(imported);
	}
	return { internal, external };
}

function getByteLength(source: string | Uint8Array): number {
	return typeof source === "string"
		? new TextEncoder().encode(source).byteLength
		: source.byteLength;
}

function normalizeOutputDirectory(directory: string): string {
	const normalized = directory.replaceAll("\\", "/").replace(/\/+$/, "");
	if (
		normalized === "" ||
		normalized === "." ||
		normalized.startsWith("/") ||
		normalized === ".." ||
		normalized.startsWith("../")
	) {
		throw new Error(
			"experimentalPerLocaleBuild Vite environment outputDirectory must be a project-relative directory."
		);
	}
	return normalized;
}

function validateViteLocaleBuildSettings(
	settings: PerLocaleBuildSettings
): void {
	if (!settings.baseLocale || !settings.locales.includes(settings.baseLocale)) {
		throw new Error(
			"experimentalPerLocaleBuild Vite environments require baseLocale to be present in locales."
		);
	}
	if (
		settings.locales.length === 0 ||
		new Set(settings.locales).size !== settings.locales.length
	) {
		throw new Error(
			"experimentalPerLocaleBuild Vite environments require at least one unique locale."
		);
	}
}
