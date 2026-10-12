import { paraglideVitePlugin } from "@inlang/paraglide-js";
import { defineConfig } from "vite";

export default defineConfig({
	build: { target: "es2022" },
	plugins: [
		paraglideVitePlugin({
			project: "./project.inlang",
			outdir: "./src/paraglide",
			strategy: ["localStorage", "baseLocale"],
			localStorageKey: "reading-list-locale",
			experimentalClientLocaleSplit: true,
		}),
	],
});
