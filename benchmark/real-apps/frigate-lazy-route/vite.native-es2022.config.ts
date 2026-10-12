import { resolve } from "node:path";
import { defineConfig, mergeConfig } from "vite";
import nativeConfig from "../vite.config";

const webRoot = resolve(import.meta.dirname, "..");

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
					replacement: resolve(webRoot, ".real-apps/native-i18n.ts"),
				},
			],
		},
	}),
);
