import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = fileURLToPath(new URL("../website/dist/client/", import.meta.url));
await fs.access(path.join(root, "benchmark.html"));
const server = http.createServer(async (request, response) => {
	let pathname = decodeURIComponent(
		new URL(request.url, "http://localhost").pathname
	);
	if (!path.extname(pathname))
		pathname += pathname === "/" ? "index.html" : ".html";
	const file = path.resolve(root, `.${pathname}`);
	if (!file.startsWith(root)) {
		response.writeHead(403);
		response.end();
		return;
	}
	try {
		const body = await fs.readFile(file);
		const type =
			{
				".html": "text/html",
				".js": "text/javascript",
				".css": "text/css",
				".json": "application/json",
				".csv": "text/csv",
			}[path.extname(file)] ?? "application/octet-stream";
		response.writeHead(200, { "Content-Type": type });
		response.end(body);
	} catch {
		response.writeHead(404);
		response.end();
	}
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
	const raw = await (await fetch(`${origin}/benchmark`)).text();
	assert(raw.includes('aria-label="Interactive benchmark explorer"'));
	const summary = await (
		await fetch(`${origin}/benchmark-data/results.json`)
	).json();
	assert.equal(summary.summary.length, 60);
	const selected = summary.summary.filter(
		(r) => r.localeCount === 10 && r.used === 200 && r.total === 1000
	);
	const paraglide = selected.find((r) => r.variant === "paraglide");
	const httpRoutes = selected.find((r) => r.variant === "i18next-http-routes");
	assert.equal(summary.validation.journeys, 300);
	const csv = await (
		await fetch(`${origin}/benchmark-data/summary.csv`)
	).text();
	assert(csv.startsWith("locales,totalMessages,usedMessages,variant,"));
	browser = await chromium.launch();
	const crawler = await browser.newContext({ javaScriptEnabled: false });
	const bot = await crawler.newPage();
	await bot.goto(`${origin}/benchmark`);
	assert((await bot.locator("table").count()) >= 5);
	assert.equal(
		await bot.getByLabel("Locales", { exact: true }).inputValue(),
		"5"
	);
	assert(await bot.getByLabel("Locales", { exact: true }).isDisabled());
	assert.equal(await bot.locator("[data-benchmark-explorer]").count(), 0);
	assert.equal(
		await bot.locator('link[rel="canonical"]').getAttribute("href"),
		"https://paraglidejs.com/benchmark"
	);
	assert(
		(await bot.locator("body").innerText()).includes(
			`${(paraglide.initialWire.median / 1024).toFixed(1)} KiB`
		)
	);
	assert(
		(await bot.locator("body").innerText()).includes(
			`${summary.overview.byteLosses}/${summary.overview.comparisonCount}`
		)
	);
	await crawler.close();
	const context = await browser.newContext({
		viewport: { width: 1440, height: 1100 },
	});
	const page = await context.newPage();
	const errors = [];
	page.on("pageerror", (error) => errors.push(error.message));
	await page.goto(`${origin}/benchmark`, { waitUntil: "networkidle" });
	await page.getByLabel("Locales", { exact: true }).selectOption("10");
	await page.getByLabel("Messages used per route").selectOption("200");
	await page.getByLabel("Metric", { exact: true }).selectOption("initialBytes");
	const table = page.getByRole("table", {
		name: "Initial Brotli transfer (KiB)",
		exact: true,
	});
	const paraglideRow = table.getByRole("row").filter({
		has: page.getByRole("rowheader", { name: "Paraglide JS", exact: true }),
	});
	const httpRow = table.getByRole("row").filter({
		has: page.getByRole("rowheader", {
			name: "i18next · HTTP routes",
			exact: true,
		}),
	});
	assert.equal(
		await paraglideRow
			.getByText((paraglide.initialWire.median / 1024).toFixed(1), {
				exact: true,
			})
			.count(),
		1
	);
	assert.equal(
		await httpRow
			.getByText((httpRoutes.initialWire.median / 1024).toFixed(1), {
				exact: true,
			})
			.count(),
		1
	);
	await page.getByLabel("Metric", { exact: true }).selectOption("journeyBytes");
	assert.equal(
		await page
			.getByRole("table", {
				name: "Full journey Brotli transfer (KiB)",
				exact: true,
			})
			.getByRole("row")
			.filter({
				has: page.getByRole("rowheader", { name: "Paraglide JS", exact: true }),
			})
			.getByText((paraglide.journeyWire.median / 1024).toFixed(1), {
				exact: true,
			})
			.count(),
		1
	);
	await page.setViewportSize({ width: 390, height: 844 });
	assert.equal(
		await page.evaluate(
			() => document.documentElement.scrollWidth > innerWidth
		),
		false
	);
	assert.deepEqual(errors, []);
	console.log(
		"Built-site checks passed: no-JS results, canonical URL, real downloads, hydration, filters, and mobile layout."
	);
} finally {
	if (browser) await browser.close();
	await new Promise((resolve) => server.close(resolve));
}
