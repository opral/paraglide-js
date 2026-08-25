import type { ParaglideConfig } from "./config-schema.js";

export {
	CONFIG_FILE_NAMES,
	isConfigFileName,
	resolveConfigCandidate,
} from "./discover-config-file.js";
export { strategyNameSchema } from "./config-schema.js";
export {
	loadParaglideConfig,
	clearParaglideConfigCache,
	type LoadedParaglideConfig,
} from "./load-paraglide-config.js";
export { resolveCompilerOptions } from "./resolve-compiler-options.js";
export { DEFAULT_OUTDIR, DEFAULT_PROJECT_PATH } from "./defaults.js";
export type { ParaglideConfig } from "./config-schema.js";

/**
 * Helper for defining a paraglide configuration in
 * `<project>/paraglide.config.js` or `.ts` with type inference and
 * validation.
 *
 * @example
 * ```ts
 * // project.inlang/paraglide.config.ts
 * import { defineConfig } from "@inlang/paraglide-js";
 *
 * export default defineConfig({
 *   outdir: "./src/paraglide",
 *   strategy: ["cookie", "preferredLanguage", "baseLocale"],
 * });
 * ```
 */
export function defineConfig(config: ParaglideConfig): ParaglideConfig {
	return config;
}
