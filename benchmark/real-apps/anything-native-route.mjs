import fs from "node:fs/promises";
import { gzipSync, brotliCompressSync, constants } from "node:zlib";
import { chromium } from "../../benchmark/node_modules/playwright/index.mjs";
// Reproduce with the pinned AnythingLLM frontend Vite preview on port 4182.
// This captures native loading only; one local timing sample is not an A/B result.
const browser = await chromium.launch({
	headless: true,
	args: ["--no-sandbox"],
});
const ctx = await browser.newContext({
	locale: "fr-FR",
	serviceWorkers: "block",
});
const page = await ctx.newPage();
const responses = [],
	pending = [],
	errors = [],
	mocks = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("response", (r) =>
	pending.push(
		(async () => {
			if (!r.url().startsWith("http://127.0.0.1:4182/")) return;
			try {
				const b = await r.body();
				responses.push({
					path: new URL(r.url()).pathname,
					status: r.status(),
					kind: r.request().resourceType(),
					raw: b.length,
					gzip: gzipSync(b).length,
					brotli: brotliCompressSync(b, {
						params: { [constants.BROTLI_PARAM_QUALITY]: 4 },
					}).length,
				});
			} catch {}
		})()
	)
);
await page.route("**/api/**", async (r) => {
	const pathname = new URL(r.request().url()).pathname;
	if (
		r.request().method() !== "GET" ||
		!["/api/onboarding", "/api/system/logo"].includes(pathname)
	) {
		errors.push("Unmodeled API: " + r.request().method() + " " + pathname);
		await r.abort();
		return;
	}
	mocks.push(pathname);
	await r.fulfill({
		json: {
			onboardingComplete: false,
			success: true,
			results: {},
			logoURL: null,
			isCustomLogo: false,
		},
	});
});
await page.addInitScript(() => {
	new PerformanceObserver(
		(l) => (window.__lcp = l.getEntries().at(-1).startTime)
	).observe({ type: "largest-contentful-paint", buffered: true });
});
try {
	await page.goto("http://127.0.0.1:4182/onboarding", {
		waitUntil: "networkidle",
	});
	await page.locator("h1").waitFor();
	await page.waitForTimeout(250);
	const rendered = await page.evaluate(() => ({
		text: document.body.innerText,
		h1: document.querySelector("h1")?.textContent,
		fcp: performance.getEntriesByName("first-contentful-paint")[0]?.startTime,
		lcp: window.__lcp,
	}));
	await Promise.allSettled(pending);
	if (
		errors.length ||
		rendered.h1 !== "Bienvenue" ||
		!rendered.text.includes("Commencer")
	)
		throw new Error(
			`Native French route failed: ${JSON.stringify({ rendered, errors })}`
		);
	const resources = responses.filter(
		(r) =>
			["script", "stylesheet", "image", "font", "document"].includes(r.kind) &&
			r.status === 200
	);
	const totals = Object.fromEntries(
		["raw", "gzip", "brotli"].map((k) => [
			k,
			resources.reduce((a, b) => a + b[k], 0),
		])
	);
	const report = {
		source: "2a10d052a1812d7be12c43f9024072cf26a27a8b",
		route: "/onboarding",
		locale: "fr-FR",
		toolchain: "Vite4.5.3 yarn1.22.22 Node22.23.2 frozen lock",
		browser: browser.version(),
		mock: "Readonly API response fixture; onboardingComplete:false",
		mocks,
		rendered,
		errors,
		totals,
		resources,
	};
	await fs.writeFile(
		".real-apps/anything-audit/native-route.json",
		JSON.stringify(report, null, 2)
	);
	console.log(JSON.stringify(report, null, 2));
} finally {
	await browser.close();
}
