import { createJiti } from "jiti";
import * as v from "valibot";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { nodeNormalizePath } from "../../utilities/node-normalize-path.js";
import { Logger } from "../logger/index.js";
import { resolveConfigCandidate } from "./discover-config-file.js";
import {
	paraglideConfigSchema,
	type ParaglideConfig,
} from "./config-schema.js";

const defaultLogger = new Logger();

export type LoadedParaglideConfig = {
	/**
	 * Absolute path of the loaded config file.
	 */
	path: string;
	/**
	 * The validated config. Paths stay as written — the integration
	 * resolves them against its working directory/root.
	 */
	config: ParaglideConfig;
};

const configCache = new Map<
	string,
	Promise<LoadedParaglideConfig | undefined>
>();

/**
 * Loads the paraglide config file from a project directory.
 *
 * The config lives inside `<projectDir>` as one of `paraglide.config.js`,
 * `paraglide.config.mjs`, `paraglide.config.ts`, or `paraglide.config.cjs`
 * (checked in this order). Returns `undefined` when no config file exists.
 *
 * Results are cached per process. Watch-mode integrations clear the cache
 * when the config changed on disk — see {@link clearParaglideConfigCache}.
 */
export async function loadParaglideConfig(args: {
	/**
	 * Absolute path of the inlang project directory that contains the
	 * config file.
	 */
	projectDir: string;
	/**
	 * Logger used for warnings (e.g. unknown options). Defaults to a
	 * module-scoped logger. Pass a silent logger to suppress warnings.
	 */
	logger?: Logger | undefined;
}): Promise<LoadedParaglideConfig | undefined> {
	// Normalized so callers handing over differently-separated paths
	// (Windows) hit the same cache entry.
	const cacheKey = nodeNormalizePath(resolve(args.projectDir));

	let cached = configCache.get(cacheKey);
	if (cached === undefined) {
		cached = load(cacheKey, args.logger ?? defaultLogger).catch(
			(error: unknown) => {
				configCache.delete(cacheKey);
				throw error;
			}
		);
		configCache.set(cacheKey, cached);
	}
	return cached;
}

/**
 * Clears the paraglide config cache.
 *
 * When called without arguments the entire cache is cleared. When
 * `projectDir` is provided only that entry is evicted.
 */
export function clearParaglideConfigCache(args?: {
	projectDir?: string;
}): void {
	if (args?.projectDir === undefined) {
		configCache.clear();
		return;
	}
	configCache.delete(nodeNormalizePath(resolve(args.projectDir)));
}

async function load(
	projectDir: string,
	logger: Logger
): Promise<LoadedParaglideConfig | undefined> {
	const configPath = await resolveConfigCandidate(projectDir);
	if (configPath === undefined) return undefined;

	// A fresh jiti instance per load with a disabled module cache ensures
	// that reloading a changed config file picks up the new content.
	const jiti = createJiti(configPath, { moduleCache: false });
	evictConfigModule(configPath);

	let exported: unknown;
	try {
		// Loaded synchronously (instead of `jiti.import`): async imports are
		// cached by Node's ESM module registry, which cannot be invalidated.
		const mod = jiti(configPath) as { default?: unknown } | undefined;
		exported = mod?.default ?? mod;
	} catch (error) {
		throw new Error(
			`Failed to load paraglide config file "${configPath}": ${
				(error as Error)?.message ?? String(error)
			}`,
			{ cause: error }
		);
	}

	return {
		path: configPath,
		config: validateConfig(exported, configPath, logger),
	};
}

function validateConfig(
	exported: unknown,
	filePath: string,
	logger: Logger
): ParaglideConfig {
	if (
		typeof exported !== "object" ||
		exported === null ||
		Array.isArray(exported)
	) {
		throw new Error(
			`Invalid paraglide config file "${filePath}": expected an object with options as the default export.`
		);
	}

	const result = v.safeParse(paraglideConfigSchema, exported);
	if (!result.success) {
		const details = result.issues
			.map((issue) => `"${v.getDotPath(issue) ?? "(root)"}": ${issue.message}`)
			.join(", ");
		throw new Error(`Invalid paraglide config file "${filePath}": ${details}.`);
	}

	const knownKeys = new Set(Object.keys(paraglideConfigSchema.entries));
	const unknownKeys = Object.keys(exported).filter(
		(key) =>
			!knownKeys.has(key) && Object.prototype.hasOwnProperty.call(exported, key)
	);
	if (unknownKeys.length > 0) {
		logger.warn(
			`Unknown option${
				unknownKeys.length === 1 ? "" : "s"
			} ${unknownKeys.map((key) => `"${key}"`).join(", ")} in paraglide config file "${filePath}".`
		);
	}

	return result.output;
}

/**
 * Clears only the config module itself, never unrelated project modules.
 *
 * Required despite `moduleCache: false`: jiti delegates plain-CJS files
 * (.cjs) to Node's native `require`, whose module cache is unaffected by
 * jiti's option. Without this eviction, reloading a changed `.cjs` config
 * serves the stale first load forever.
 */
function evictConfigModule(configPath: string): void {
	const require = createRequire(configPath);
	delete require.cache[configPath];
	try {
		delete require.cache[require.resolve(configPath)];
	} catch {
		// The file was removed between discovery and loading.
	}
}
