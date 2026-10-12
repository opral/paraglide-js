import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const [distArg] = process.argv.slice(2);
if (!distArg) throw new Error("Usage: node stirling-language-switch.mjs <production-dist>");
const playwrightModule = process.env.PLAYWRIGHT_MODULE ?? path.resolve(scriptDir, "../../benchmark/node_modules/playwright/index.mjs");
const { chromium } = await import(pathToFileURL(playwrightModule).href);
const root = path.resolve(distArg);
const contentTypes = { ".css": "text/css; charset=utf-8", ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml" };
const server = http.createServer(async (request, response) => {
	try {
		const pathname = decodeURIComponent(new URL(request.url ?? "/", "http://127.0.0.1").pathname);
		if (pathname.startsWith("/api/")) {
			response.writeHead(404, { "content-type": "application/json" }).end("{}");
			return;
		}
		let filename = path.resolve(root, `.${pathname}`);
		if (!filename.startsWith(`${root}${path.sep}`) && filename !== root) throw new Error("path escaped dist");
		try { if (!(await fs.stat(filename)).isFile()) filename = path.join(root, "index.html"); }
		catch { filename = path.join(root, "index.html"); }
		let body = await fs.readFile(filename);
		if (path.basename(filename) === "index.html" && pathname !== "/") {
			// The app's relative base works at `/`, but reloads on nested client routes
			// need an origin-root base so the production assets still resolve.
			body = Buffer.from(body.toString("utf8").replace(/<base href="\.\/"\s*\/>/, '<base href="/">'));
		}
		response.writeHead(200, { "content-type": contentTypes[path.extname(filename)] ?? "application/octet-stream", "cache-control": "no-store" }).end(body);
	} catch (error) { response.writeHead(500).end(String(error)); }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
let result;
try {
	const page = await browser.newPage({ locale: "fr-FR", serviceWorkers: "block" });
	const errors = [];
	page.on("pageerror", (error) => errors.push(error.message));
	await page.route("**/*", (route) => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
	await page.goto(origin, { waitUntil: "domcontentloaded", timeout: 30000 });
	await page.waitForFunction(() => document.body?.innerText.includes("Bibliothèque PDF"), undefined, { timeout: 30000 });
	await page.locator('[data-testid="config-button"]').first().click();
	await page.locator('[data-testid="language-selector-button"]').waitFor({ timeout: 10000 });
	const frenchSettings = await page.locator("body").innerText();
	const frenchBefore = frenchSettings.includes("Paramètres du compte") && frenchSettings.includes("Français");
	if (!frenchBefore) throw new Error("French settings UI did not render before switching languages");
	await page.locator('[data-testid="language-selector-button"]').click();
	const english = page.getByRole("button", { name: "English (US)", exact: true });
	await english.waitFor({ timeout: 10000 });
	await english.click();
	await page.waitForTimeout(5000);
	const switchedLocale = await page.locator("html").getAttribute("lang");
	const visibleText = await page.locator("body").innerText();
	const englishAfter = switchedLocale === "en-US" && visibleText.includes("Account Settings") && visibleText.includes("Keyboard Shortcuts") && !visibleText.includes("Paramètres du compte");
	result = { initialLocale: "fr-FR", switchedLocale, frenchBefore, englishAfter, errors };
	if (!englishAfter) {
		const diagnostics = await page.evaluate(() => ({ url: location.href, readyState: document.readyState, html: document.documentElement.outerHTML.slice(0, 1200), body: document.body?.innerHTML.slice(0, 800) }));
		throw new Error(`Language switch did not reach English UI: ${JSON.stringify({ switchedLocale, visibleText: visibleText.slice(0, 300), errors, diagnostics })}`);
	}
	if (errors.length) throw new Error(`Page errors during language switch: ${errors.join("; ")}`);
} finally {
	await browser.close();
	await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}
console.log(JSON.stringify(result, null, 2));
