import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { ntfyParaglideAdapter } from "./vite-adapter.mjs";
import { ntfySparseStaticFallback } from "./sparse-static-fallback.mjs";

const appRoot = process.env.NTFY_WEB_ROOT;
if (!appRoot) throw new Error("Set NTFY_WEB_ROOT to the ntfy web directory.");
const repoRoot = path.resolve(appRoot, "..");
const here = path.dirname(fileURLToPath(import.meta.url));
const compilerRoot = path.resolve(here, "../../..");
const benchmarkRoot = process.env.NTFY_BENCHMARK_OUTPUT_ROOT ?? path.join(compilerRoot, ".real-apps/ntfy-ab");
const paraglidePluginPath = process.env.PARAGLIDE_PLUGIN_MODULE ?? "/root/repos-iii/paraglide-client-split-pr4/dist/index.js";
const { paraglideVitePlugin } = await import(paraglidePluginPath);
const split = process.env.NTFY_LOCALE_SPLIT === "1";
const sparseStaticFallback = process.env.NTFY_SPARSE_STATIC_FALLBACK === "1";
const buildName = process.env.NTFY_BUILD_NAME ?? (split ? "paraglide-split" : "paraglide-default");

export default defineConfig({
	root: appRoot,
	base: "/",
	build: {
		outDir: path.join(repoRoot, "benchmark-output", buildName),
		assetsDir: "static/media",
		sourcemap: false,
		target: split ? "esnext" : "baseline-widely-available",
		emptyOutDir: true,
	},
	resolve: {
		alias: [
			{ find: "react-i18next", replacement: path.join(appRoot, "src/benchmark-adapter/react-i18next-bridge.js") },
			{ find: "i18next", replacement: path.join(appRoot, "src/benchmark-adapter/i18next-bridge.js") },
		],
	},
	plugins: [
		paraglideVitePlugin({
			project: path.join(appRoot, "project.inlang"),
			outdir: path.join(appRoot, "src/paraglide"),
			strategy: ["localStorage", "baseLocale"],
			localStorageKey: "i18nextLng",
			outputStructure: "locale-modules",
			experimentalClientLocaleSplit: split,
		}),
		...(sparseStaticFallback
			? [ntfySparseStaticFallback({ metadataPath: path.join(appRoot, "src/paraglide/client-locale-split.json") })]
			: []),
		ntfyParaglideAdapter({
			sourceRoot: path.join(appRoot, "src"),
			generated: path.join(appRoot, "src/paraglide"),
			mappingPath: path.join(benchmarkRoot, "mapping.json"),
		}),
		react(),
		VitePWA({
			registerType: "autoUpdate",
			injectRegister: null,
			strategies: "injectManifest",
			devOptions: { enabled: false },
			injectManifest: {
				globPatterns: ["**/*.{js,css,html,ico,png,svg,json}"],
				globIgnores: ["config.js"],
			},
			manifest: false,
		}),
	],
});
