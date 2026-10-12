import assert from "node:assert/strict";
import { chromium } from "playwright";

const previewUrl = process.env.PREVIEW_URL ?? "http://127.0.0.1:4173";
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
const page = await context.newPage();
const documentNavigations = [];
const requestedLocaleChunks = [];
const pageErrors = [];
const countChecks = [];

page.on("framenavigated", (frame) => {
	if (frame === page.mainFrame()) documentNavigations.push(frame.url());
});
page.on("request", (request) => {
	const match = request.url().match(/_paraglide_client-locale-split_locale_(en|de|fr)-/);
	if (match) requestedLocaleChunks.push(match[1]);
});
page.on("pageerror", (error) => pageErrors.push(error.message));

try {
	await page.goto(previewUrl, { waitUntil: "networkidle" });
	assert.equal(await page.locator("html").getAttribute("lang"), "en");
	assert.equal(await page.title(), "Reading list");
	assert.equal(await page.locator(".greeting").textContent(), "Welcome, Alex.");
	assert.equal(await page.locator(".count").textContent(), "2 books on your list");
	const savedEnglishPreference = await page.evaluate(() => localStorage.getItem("reading-list-locale"));
	assert.equal(savedEnglishPreference, "en");

	await page.locator('[data-action="preview-german"]').click();
	await page.waitForFunction(() => document.querySelector(".preview-result")?.textContent === "Willkommen, Alex.");
	const germanPreviewText = await page.locator(".preview-result").textContent();
	const activeLocaleAfterPreview = await page.locator("html").getAttribute("lang");
	const storedLocaleAfterPreview = await page.evaluate(() => localStorage.getItem("reading-list-locale"));
	assert.equal(activeLocaleAfterPreview, "en");
	assert.equal(await page.title(), "Reading list");
	assert.equal(await page.locator(".greeting").textContent(), "Welcome, Alex.");
	assert.equal(await page.locator(".count").textContent(), "2 books on your list");
	assert.equal(storedLocaleAfterPreview, savedEnglishPreference);
	assert.equal(documentNavigations.length, 1);
	assert.deepEqual([...new Set(requestedLocaleChunks)].sort(), ["de", "en"]);

	await page.locator("select").selectOption("fr");
	await page.waitForFunction(() => document.documentElement.lang === "fr");
	assert.equal(await page.title(), "Liste de lecture");
	assert.equal(await page.locator(".greeting").textContent(), "Bienvenue, Alex.");
	assert.equal(await page.evaluate(() => localStorage.getItem("reading-list-locale")), "fr");
	assert.equal(documentNavigations.length, 1, "changing the page language should not navigate the document");

	await page.reload({ waitUntil: "networkidle" });
	assert.equal(await page.locator("html").getAttribute("lang"), "fr");
	assert.equal(await page.title(), "Liste de lecture");
	assert.equal(await page.locator(".greeting").textContent(), "Bienvenue, Alex.");
	assert.equal(await page.evaluate(() => localStorage.getItem("reading-list-locale")), "fr");
	assert.equal(await page.locator(".count").textContent(), "2 livres dans votre liste");
	countChecks.push({ value: 2, text: await page.locator(".count").textContent() });
	assert.equal(documentNavigations.length, 2, "only the initial load and explicit preference reload should navigate");

	await page.locator('[data-action="decrease"]').click();
	assert.equal(await page.locator(".count").textContent(), "1 livre dans votre liste");
	countChecks.push({ value: 1, text: await page.locator(".count").textContent() });
	await page.locator('[data-action="decrease"]').click();
	assert.equal(await page.locator(".count").textContent(), "Aucun livre dans votre liste pour le moment");
	countChecks.push({ value: 0, text: await page.locator(".count").textContent() });
	await page.locator('[data-action="increase"]').click();
	assert.equal(await page.locator(".count").textContent(), "1 livre dans votre liste");
	countChecks.push({ value: 1, text: await page.locator(".count").textContent() });
	await page.locator('[data-action="increase"]').click();
	assert.equal(await page.locator(".count").textContent(), "2 livres dans votre liste");
	countChecks.push({ value: 2, text: await page.locator(".count").textContent() });

	assert.deepEqual([...new Set(requestedLocaleChunks)].sort(), ["de", "en", "fr"]);
	assert.deepEqual(pageErrors, []);
	console.log(
		JSON.stringify(
			{
				result: "passed",
				previewUrl,
				germanPreviewText,
				activeLocaleAfterPreview,
				storedLocaleAfterPreview,
				requestedLocaleChunks,
				documentNavigations,
				countChecks,
				pageErrors,
			},
			null,
			2
		)
	);
} finally {
	await browser.close();
}
