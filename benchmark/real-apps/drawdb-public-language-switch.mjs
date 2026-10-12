import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { performance } from "node:perf_hooks";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const playwrightModule =
	process.env.PLAYWRIGHT_MODULE ??
	path.resolve(repo, "../paraglide-real-apps/benchmark/node_modules/playwright/index.mjs");
const { chromium } = await import(pathToFileURL(playwrightModule).href);

const outputRoot = path.resolve(
	process.env.DRAWDB_OUTPUT ?? path.join(repo, ".real-apps/drawdb-public-split")
);
const resultPath = path.resolve(
	process.env.DRAWDB_SWITCH_REPORT ?? path.join(outputRoot, "switch-results.json")
);
const variants = ["native", "public-default", "public-split"].map(
	(label, index) => ({
		label,
		port: 4197 + index,
		root: path.join(outputRoot, `app-${label}/dist`),
	})
);
const servers = [];
const contentTypes = {
	".css": "text/css; charset=utf-8",
	".html": "text/html; charset=utf-8",
	".ico": "image/x-icon",
	".js": "text/javascript; charset=utf-8",
	".json": "application/json; charset=utf-8",
	".png": "image/png",
	".svg": "image/svg+xml",
	".woff": "font/woff",
	".woff2": "font/woff2",
};

async function startServer(variant) {
	const root = path.resolve(variant.root);
	await fs.access(path.join(root, "index.html"));
	const server = http.createServer(async (request, response) => {
		try {
			const pathname = decodeURIComponent(
				new URL(request.url ?? "/", "http://localhost").pathname
			);
			let filename = path.resolve(root, `.${pathname}`);
			if (!filename.startsWith(`${root}${path.sep}`) && filename !== root)
				throw new Error("Path escaped app dist");
			try {
				if (!(await fs.stat(filename)).isFile())
					filename = path.join(root, "index.html");
			} catch {
				filename = path.join(root, "index.html");
			}
			response.writeHead(200, {
				"cache-control": "no-store",
				"content-type":
					contentTypes[path.extname(filename)] ?? "application/octet-stream",
				"x-content-type-options": "nosniff",
			}).end(await fs.readFile(filename));
		} catch {
			response.writeHead(500).end("local fixture server error");
		}
	});
	await new Promise((resolve) => server.listen(variant.port, "127.0.0.1", resolve));
	servers.push(server);
}

const browser = await chromium.launch({ headless: true });
const trials = Number(process.env.DRAWDB_SWITCH_TRIALS ?? 3);
const rows = [];
const nativeText = new Map();
try {
	for (const variant of variants) await startServer(variant);
	for (let trial = 0; trial < trials; trial++) {
		for (const variant of variants) {
			const context = await browser.newContext({
				viewport: { width: 1365, height: 768 },
			});
			await context.addInitScript(() => {
				localStorage.setItem("i18nextLng", "en");
			});
			const page = await context.newPage();
			const client = await context.newCDPSession(page);
			await client.send("Network.enable");
			await client.send("Network.setCacheDisabled", { cacheDisabled: true });
			await client.send("Network.emulateNetworkConditions", {
				offline: false,
				latency: 80,
				downloadThroughput: (20 * 1024 * 1024) / 8,
				uploadThroughput: (2 * 1024 * 1024) / 8,
				connectionType: "cellular4g",
			});
			await client.send("Emulation.setCPUThrottlingRate", { rate: 3 });
			const origin = `http://127.0.0.1:${variant.port}`;
			await page.route("**/*", (route) =>
				new URL(route.request().url()).origin === origin
					? route.continue()
					: route.abort()
			);
			const errors = [];
			page.on("pageerror", (error) => errors.push(error.message));
			await page.goto(`${origin}/editor`, { waitUntil: "domcontentloaded" });
			await page.waitForFunction(
				() => (document.querySelector("#root")?.innerText.length ?? 0) > 50,
				{ timeout: 30000 }
			);

			// DrawDB asks first-time users to choose a database before editing.
			await page.getByText("MySQL", { exact: true }).click({ timeout: 10000 });
			await page.getByText("Confirm", { exact: true }).click();
			await page.getByText("Settings", { exact: true }).click();
			await page.getByText("Language", { exact: true }).click();
			await page.getByText("German", { exact: true }).click();
			const switchStarted = performance.now();
			await page.getByText("Confirm", { exact: true }).click();
			await page.waitForFunction(
				() =>
					localStorage.getItem("i18nextLng") === "de" &&
					(document.querySelector("#root")?.innerText.includes("Datei") ?? false),
				{ timeout: 15000 }
			);
			const switchMs = Math.round(performance.now() - switchStarted);
			await page.waitForTimeout(250);
			const text = await page.locator("#root").innerText();
			const row = {
				trial,
				variant: variant.label,
				startupLocale: "en",
				switchedLocale: await page.evaluate(() => localStorage.getItem("i18nextLng")),
				switchMs,
				visibleTextLength: text.length,
				visibleText: text,
				pageErrors: errors,
			};
			if (variant.label === "native") nativeText.set(trial, text);
			else row.matchesNative = text === nativeText.get(trial);
			rows.push(row);
			console.log(`${variant.label} trial ${trial + 1}: switched in ${switchMs}ms, exact text parity ${row.matchesNative ?? true}`);
			await context.close();
		}
	}
	await browser.close();
	const median = (values) => {
		const sorted = [...values].sort((a, b) => a - b);
		return sorted[Math.floor(sorted.length / 2)];
	};
	const summary = variants.map(({ label }) => {
		const samples = rows.filter((row) => row.variant === label);
		return {
			variant: label,
			observations: samples.length,
			medianSwitchMs: median(samples.map((row) => row.switchMs)),
			parityFailures: samples.filter((row) => row.matchesNative === false).length,
			pageErrors: samples.flatMap((row) => row.pageErrors),
		};
	});
	const report = { browserVersion: browser.version(), trials, summary, rows };
	await fs.writeFile(resultPath, `${JSON.stringify(report, null, 2)}\n`);
	console.log(`Wrote ${resultPath}`);
	if (summary.some((row) => row.parityFailures || row.pageErrors.length))
		throw new Error(`Locale-switch parity or page errors: ${JSON.stringify(summary)}`);
} finally {
	for (const server of servers) server.close();
	if (browser.isConnected()) await browser.close();
}
