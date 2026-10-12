import path from "node:path";
import { defineConfig } from "vitest/config";

const adapterRoot = path.resolve("src/benchmark-adapter");

export default defineConfig({
	resolve: {
		alias: [
			{ find: /^i18next$/, replacement: path.join(adapterRoot, "i18next-bridge.js") },
			{ find: /^react-i18next$/, replacement: path.join(adapterRoot, "react-i18next-bridge.js") },
		],
	},
	test: {
		environment: "node",
		setupFiles: ["./src/test/setup.js"],
		include: ["src/**/*.test.{js,jsx}"],
		globals: false,
	},
});
