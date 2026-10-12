import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { defineConfig, mergeConfig } from "vite";
import nativeConfig from "../vite.config";

const webRoot = resolve(import.meta.dirname, "..");
const compilerEntry = process.env.PARAGLIDE_PLUGIN_ENTRY;
if (!compilerEntry) throw new Error("Set PARAGLIDE_PLUGIN_ENTRY to the pinned compiler dist/index.js.");
const { paraglideVitePlugin } = await import(pathToFileURL(compilerEntry).href);

export default mergeConfig(
	nativeConfig,
	defineConfig({
		build: {
			target: "es2022",
			outDir: resolve(webRoot, "dist"),
			emptyOutDir: true,
		},
		resolve: {
			alias: [
				{
					find: "@/utils/i18n",
					replacement: resolve(webRoot, ".real-apps/candidate-i18n.ts"),
				},
			],
		},
		plugins: [
			paraglideVitePlugin({
				project: resolve(webRoot, ".real-apps/paraglide-project.inlang"),
				outdir: resolve(webRoot, "src/paraglide"),
				strategy: ["localStorage", "preferredLanguage", "baseLocale"],
				localStorageKey: "frigate-ui-language",
				emitTsDeclarations: false,
				experimentalClientLocaleSplit: true,
			}),
		],
	}),
);
