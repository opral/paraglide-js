import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(root, "dist");
const playwrightModule = path.resolve(process.env.PLAYWRIGHT_MODULE ?? path.join(root, "node_modules/playwright/index.mjs"));
const { chromium } = await import(pathToFileURL(playwrightModule).href);
const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json" };
const server = http.createServer(async (req, res) => {
	try {
		const pathname = decodeURIComponent(new URL(req.url ?? "/", "http://localhost").pathname);
		let file = path.resolve(dist, `.${pathname}`);
		if (!file.startsWith(`${dist}${path.sep}`) && file !== dist) throw new Error("path escaped dist");
		try { if (!(await fs.stat(file)).isFile()) file = path.join(dist, "index.html"); }
		catch { file = path.join(dist, "index.html"); }
		const body = await fs.readFile(file);
		res.writeHead(200, { "content-type": mime[path.extname(file)] ?? "application/octet-stream", "cache-control": "no-store" }).end(body);
	} catch (error) { res.writeHead(500).end(String(error)); }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
const errors = [];
const snapshots = {};
try {
	const context = await browser.newContext();
	await context.addInitScript(() => localStorage.setItem("locale", "fr-FR"));
	const page = await context.newPage();
	page.on("pageerror", (error) => errors.push(error.message));
	const docRequests = [];
	page.on("request", (request) => { if (request.resourceType() === "document") docRequests.push(request.url()); });
	await page.goto(origin, { waitUntil: "networkidle" });
	await page.waitForFunction(() => document.querySelector("#state")?.textContent === "fr-FR|Bonjour|Connexion");
	snapshots.startup = await page.evaluate(() => ({
		text: document.querySelector("#state").textContent,
		htmlLang: document.documentElement.lang,
		stored: localStorage.getItem("locale"),
	}));
	snapshots.switchToEnglish = await page.evaluate(() => window.probeLocaleSplit.switchTo("en-US"));
	snapshots.switchBackToFrench = await page.evaluate(() => window.probeLocaleSplit.switchTo("fr-FR"));
	snapshots.navigationCountAfterInPlaceSwitches = docRequests.length;
	await context.close();

	const explicitContext = await browser.newContext();
	await explicitContext.addInitScript(() => localStorage.setItem("locale", "en-US"));
	const explicitPage = await explicitContext.newPage();
	explicitPage.on("pageerror", (error) => errors.push(error.message));
	const localeRequests = [];
	explicitPage.on("request", (request) => {
		if (/locale_fr-FR/i.test(request.url())) localeRequests.push(request.url());
	});
	await explicitPage.goto(origin, { waitUntil: "networkidle" });
	await explicitPage.waitForFunction(() => document.querySelector("#state")?.textContent === "en-US|Hello|Sign in");
	snapshots.explicitBefore = await explicitPage.evaluate(() => ({
		text: document.querySelector("#state").textContent,
		locale: window.probeLocaleSplit.activeLocale(),
		stored: localStorage.getItem("locale"),
	}));
	const beforeExplicit = localeRequests.length;
	snapshots.explicitFrenchResult = await explicitPage.evaluate(() => window.probeLocaleSplit.explicit("fr-FR"));
	snapshots.explicitAfter = await explicitPage.evaluate(() => ({
		text: document.querySelector("#state").textContent,
		htmlLang: document.documentElement.lang,
		stored: localStorage.getItem("locale"),
		activeLocale: window.probeLocaleSplit.activeLocale(),
	}));
	snapshots.explicitLocaleModuleRequestCount = { before: beforeExplicit, after: localeRequests.length, urls: localeRequests };
	await explicitContext.close();
	assert.deepEqual(snapshots.startup, { text: "fr-FR|Bonjour|Connexion", htmlLang: "fr-FR", stored: "fr-FR" });
	assert.equal(snapshots.switchToEnglish.text, "en-US|Hello|Sign in");
	assert.equal(snapshots.switchToEnglish.stored, "en-US");
	assert.equal(snapshots.switchBackToFrench.text, "fr-FR|Bonjour|Connexion");
	assert.equal(snapshots.switchBackToFrench.stored, "fr-FR");
	assert.equal(snapshots.navigationCountAfterInPlaceSwitches, 1);
	assert.equal(snapshots.explicitBefore.text, "en-US|Hello|Sign in");
	assert.equal(snapshots.explicitBefore.locale, "en-US");
	assert.equal(snapshots.explicitBefore.stored, "en-US");
	assert.equal(snapshots.explicitFrenchResult, "Bonjour");
	assert.equal(snapshots.explicitAfter.text, "en-US|Hello|Sign in");
	assert.equal(snapshots.explicitAfter.stored, "en-US");
	assert.equal(snapshots.explicitAfter.activeLocale, "en-US");
	assert.equal(localeRequests.length > beforeExplicit, true);
	assert.deepEqual(errors, []);
	const report = {
		compilerCommit: "6997d020813d76f087d585110e62cd54891726e0",
		viteVersion: "8.1.4",
		buildTarget: "es2022",
		config: "paraglideVitePlugin with experimentalClientLocaleSplit, localStorage strategy, localStorageKey=locale",
		checks: { persistedLocaleStartup: true, inPlaceSwitchNoDocumentNavigation: true, explicitLocaleAfterPreload: true, noPageErrors: true },
		origin,
		snapshots,
		localeRequests,
		errors,
	};
	if (process.env.OUTPUT_JSON) {
		const outputPath = path.resolve(process.env.OUTPUT_JSON);
		await fs.mkdir(path.dirname(outputPath), { recursive: true });
		await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
	}
	console.log(JSON.stringify(report, null, 2));
} finally {
	await browser.close();
	await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}
