import { defineConfig } from "@playwright/test";

export default defineConfig({
	testDir: "./tests",
	use: {
		baseURL: "http://127.0.0.1:3150",
		launchOptions: process.env.PARAGLIDE_TEST_CHROMIUM
			? { executablePath: process.env.PARAGLIDE_TEST_CHROMIUM }
			: {},
	},
	webServer: {
		command:
			"npm run build && npm run start -- --hostname 127.0.0.1 --port 3150",
		url: "http://127.0.0.1:3150",
		timeout: 120_000,
		reuseExistingServer: false,
	},
});
