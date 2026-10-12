#!/usr/bin/env node
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { brotliCompressSync, constants as zlibConstants } from "node:zlib";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "../..");
const workspacesRoot = path.resolve(repoRoot, "..");
const browserModule = process.env.PLAYWRIGHT_MODULE ?? path.join(workspacesRoot, "paraglide-real-apps/benchmark/node_modules/playwright/index.mjs");
const { chromium } = await import(pathToFileURL(browserModule).href);
const defaultVariants = [
	{ name: "native-es2022", root: path.resolve(process.env.OPENWEBUI_NATIVE_BUILD ?? path.join(repoRoot, ".real-apps/openwebui-native-ab/build")) },
	{ name: "paraglide-auth-es2022", root: path.resolve(process.env.OPENWEBUI_PARAGLIDE_BUILD ?? path.join(repoRoot, ".real-apps/openwebui-paraglide-ab/build")) },
];
const variants = process.env.OPENWEBUI_AB_VARIANTS
	? JSON.parse(process.env.OPENWEBUI_AB_VARIANTS).map(({ name, root }) => ({ name, root: path.resolve(root) }))
	: defaultVariants;
if (variants.length !== 2) throw new Error("The route harness currently requires exactly two variants");
const route = "/auth?lang=fr-FR";
const outputFile = path.resolve(process.env.OPENWEBUI_AB_OUTPUT ?? path.join(scriptDir, "results/openwebui-auth-ab.json"));
const trialCount = Number(process.env.OPENWEBUI_AB_TRIALS ?? 1);
const waitAfterReadyMs = Number(process.env.OPENWEBUI_AB_SETTLE_MS ?? 800);
const testLocaleNavigation = process.env.OPENWEBUI_TEST_LOCALE_NAVIGATION === "1";
const localeCases = process.env.OPENWEBUI_NAVIGATION_LOCALES
	? JSON.parse(process.env.OPENWEBUI_NAVIGATION_LOCALES)
	: [["en-US", ["Password", "Sign in"]], ["fr-FR", ["Mot de passe", "Connexion"]]];
const contentTypes = {
	".css": "text/css; charset=utf-8", ".html": "text/html; charset=utf-8", ".ico": "image/x-icon",
	".js": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
	".png": "image/png", ".svg": "image/svg+xml", ".wasm": "application/wasm", ".woff2": "font/woff2",
};
const compressible = new Set([".css", ".html", ".js", ".json", ".mjs", ".svg", ".txt", ".webmanifest", ".xml"]);
const compressedCache = new Map();

function serverFor(root) {
	return http.createServer(async (request, response) => {
		try {
			const pathname = decodeURIComponent(new URL(request.url ?? "/", "http://127.0.0.1").pathname);
			if (pathname === "/api/config") {
				const fixture = { status: true, name: "Open WebUI", version: "0.8.0", default_locale: "fr-FR", i18n: {}, oauth: { providers: {}, auto_redirect: false }, features: { auth: true, auth_trusted_header: false, enable_signup: false, enable_login_form: true, enable_ldap: false, enable_websocket: false, enable_signup_password_confirmation: false } };
				response.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" }).end(JSON.stringify(fixture));
				return;
			}
			if (pathname.startsWith("/api/") || pathname.startsWith("/ollama/")) {
				response.writeHead(404, { "content-type": "application/json" }).end("{}");
				return;
			}
			let filename = path.resolve(root, `.${pathname}`);
			if (!filename.startsWith(`${root}${path.sep}`) && filename !== root) throw new Error("path escaped output root");
			try { if (!(await fs.stat(filename)).isFile()) filename = path.join(root, "index.html"); }
			catch { filename = path.join(root, "index.html"); }
			const body = await fs.readFile(filename);
			const headers = { "cache-control": "no-store", "content-type": contentTypes[path.extname(filename)] ?? "application/octet-stream", "x-content-type-options": "nosniff" };
			if ((request.headers["accept-encoding"] ?? "").includes("br") && compressible.has(path.extname(filename)) && body.length > 256) {
				let encoded = compressedCache.get(filename);
				if (!encoded) {
					encoded = brotliCompressSync(body, { params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 4 } });
					compressedCache.set(filename, encoded);
				}
				response.writeHead(200, { ...headers, "content-encoding": "br", "content-length": encoded.length, vary: "accept-encoding" }).end(encoded);
			} else response.writeHead(200, { ...headers, "content-length": body.length }).end(body);
		} catch (error) { response.writeHead(500).end(String(error)); }
	});
}

const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
const samples = [];
try {
	for (let trial = 0; trial < trialCount; trial++) {
		const order = trial % 2 === 0 ? variants : [...variants].reverse();
		for (const variant of order) {
			await fs.access(path.join(variant.root, "index.html"));
			const server = serverFor(variant.root);
			await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
			const origin = `http://127.0.0.1:${server.address().port}`;
			const context = await browser.newContext({ viewport: { width: 1365, height: 768 }, locale: "fr-FR", serviceWorkers: "block" });
			const page = await context.newPage();
			const client = await context.newCDPSession(page);
			await client.send("Network.enable");
			await client.send("Network.setCacheDisabled", { cacheDisabled: true });
			await client.send("Network.emulateNetworkConditions", { offline: false, latency: 80, downloadThroughput: (20 * 1024 * 1024) / 8, uploadThroughput: (2 * 1024 * 1024) / 8, connectionType: "cellular4g" });
			await client.send("Emulation.setCPUThrottlingRate", { rate: 3 });
			await page.route("**/*", (request) => new URL(request.request().url()).origin === origin ? request.continue() : request.abort());
			const pageErrors = [];
			page.on("pageerror", (error) => pageErrors.push(error.message));
			await page.addInitScript(() => {
				localStorage.setItem('locale', 'fr-FR');
				window.__authPerf = { fcp: null, lcp: null, lcpText: "", longTaskMs: 0 };
				new PerformanceObserver((list) => { for (const entry of list.getEntries()) if (entry.name === "first-contentful-paint") window.__authPerf.fcp = entry.startTime; }).observe({ type: "paint", buffered: true });
				new PerformanceObserver((list) => { for (const entry of list.getEntries()) { window.__authPerf.lcp = entry.startTime; window.__authPerf.lcpText = entry.element?.textContent?.trim?.().slice(0, 120) ?? ""; } }).observe({ type: "largest-contentful-paint", buffered: true });
				try { new PerformanceObserver((list) => { window.__authPerf.longTaskMs += list.getEntries().reduce((sum, entry) => sum + entry.duration, 0); }).observe({ type: "longtask", buffered: true }); } catch {}
			});
			const started = performance.now();
			let ready = false;
			let readyError = null;
			try {
				await page.goto(`${origin}${route}`, { waitUntil: "domcontentloaded", timeout: 30000 });
				await page.waitForFunction(() => {
					const text = document.body?.innerText ?? "";
					return !document.getElementById("splash-screen") && text.includes("Mot de passe") && text.includes("Connexion");
				}, { timeout: 30000 });
				ready = true;
			} catch (error) { readyError = error.message; }
			const readyState = await page.evaluate(() => ({
				text: document.body?.innerText?.trim() ?? "",
				htmlLang: document.documentElement.lang,
				splashPresent: Boolean(document.getElementById("splash-screen")),
				readyMs: performance.now(),
				fcpMs: window.__authPerf?.fcp,
				lcpMs: window.__authPerf?.lcp,
				lcpText: window.__authPerf?.lcpText,
				longTaskMs: window.__authPerf?.longTaskMs ?? 0,
			}));
			if (ready) await page.waitForTimeout(waitAfterReadyMs);
			const sample = await page.evaluate(() => ({
				text: document.body?.innerText?.trim() ?? "",
				title: document.title,
				controls: [...document.querySelectorAll("input, button, textarea, select, [role=button]")]
					.filter((element) => element.getClientRects().length > 0)
					.map((element) => ({
						tag: element.tagName.toLowerCase(),
						type: element.getAttribute("type"),
						name: element.getAttribute("name"),
						id: element.id || null,
						text: element.innerText?.trim() ?? "",
						ariaLabel: element.getAttribute("aria-label"),
						placeholder: element.getAttribute("placeholder"),
						value: "value" in element ? element.value : null,
						labels: element.labels ? [...element.labels].map((label) => label.innerText.trim()) : [],
					})),
				htmlLang: document.documentElement.lang,
				splashPresent: Boolean(document.getElementById("splash-screen")),
				lcpMs: window.__authPerf?.lcp,
				lcpText: window.__authPerf?.lcpText,
				longTaskMs: window.__authPerf?.longTaskMs ?? 0,
				resources: [
					...performance.getEntriesByType("navigation").map((entry) => ({ name: entry.name.replace(location.origin, ""), document: true, transferBytes: entry.transferSize, encodedBytes: entry.encodedBodySize, decodedBytes: entry.decodedBodySize })),
					...performance.getEntriesByType("resource").map((entry) => ({ name: entry.name.replace(location.origin, ""), transferBytes: entry.transferSize, encodedBytes: entry.encodedBodySize, decodedBytes: entry.decodedBodySize })),
				],
			}));
			const sameOrigin = sample.resources.filter((resource) => resource.name.startsWith("/"));
			let localeNavigation = null;
			if (testLocaleNavigation) {
				localeNavigation = [];
				for (const [locale, expected] of localeCases) {
					await page.goto(`${origin}/auth?lang=${encodeURIComponent(locale)}`, { waitUntil: "domcontentloaded", timeout: 30000 });
					await page.waitForFunction((terms) => terms.every((term) => document.body?.innerText?.includes(term)), expected, { timeout: 10000 });
					await page.waitForFunction(() => !document.getElementById("splash-screen"), { timeout: 10000 });
					localeNavigation.push({ locale, ...(await page.evaluate(() => ({
						title: document.title,
						language: document.documentElement.lang,
						storedLocale: localStorage.getItem("locale"),
						text: document.body?.innerText?.trim() ?? "",
						controls: [...document.querySelectorAll("input, button, textarea, select, [role=button]")]
							.filter((element) => element.getClientRects().length > 0)
							.map((element) => ({
								tag: element.tagName.toLowerCase(),
								type: element.getAttribute("type"),
								name: element.getAttribute("name"),
								id: element.id || null,
								text: element.innerText?.trim() ?? "",
								ariaLabel: element.getAttribute("aria-label"),
								placeholder: element.getAttribute("placeholder"),
								value: "value" in element ? element.value : null,
								labels: element.labels ? [...element.labels].map((label) => label.innerText.trim()) : [],
							})),
					}))) });
				}
			}
			samples.push({
				variant: variant.name,
				trial,
				route,
				ready,
				readyError,
				translatedReadyMs: ready ? Math.round(readyState.readyMs) : null,
				htmlLangAtReady: readyState.htmlLang,
				splashPresentAtReady: readyState.splashPresent,
				fcpMs: Math.round(readyState.fcpMs ?? 0),
				lcpMs: Math.round(sample.lcpMs ?? 0),
				lcpText: sample.lcpText,
				longTaskMs: Math.round(sample.longTaskMs),
				resourceCount: sameOrigin.length,
				encodedBodyBytes: sameOrigin.reduce((sum, item) => sum + (item.encodedBytes || 0), 0),
				transferBytes: sameOrigin.reduce((sum, item) => sum + (item.transferBytes || 0), 0),
				decodedBodyBytes: sameOrigin.reduce((sum, item) => sum + (item.decodedBytes || 0), 0),
				localeResources: sameOrigin.filter((item) => /paraglide|locales|translation|messages|i18n/i.test(item.name)),
				pageErrors,
				visibleText: sample.text,
				title: sample.title,
				visibleControls: sample.controls,
				localeNavigation,
				resources: sameOrigin,
			});
			await context.close();
			await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
		}
	}
} finally { await browser.close(); }

const group = (variant) => samples.filter((sample) => sample.variant === variant);
const median = (values) => {
	const sorted = [...values].sort((a, b) => a - b);
	const middle = Math.floor(sorted.length / 2);
	return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};
const summary = Object.fromEntries(variants.map(({ name }) => [name, {
	readyMs: median(group(name).map((sample) => sample.translatedReadyMs ?? Infinity)),
	bodyBytes: median(group(name).map((sample) => sample.encodedBodyBytes)),
	transferBytes: median(group(name).map((sample) => sample.transferBytes)),
	fcpMs: median(group(name).map((sample) => sample.fcpMs)),
	lcpMs: median(group(name).map((sample) => sample.lcpMs)),
	resourceCount: median(group(name).map((sample) => sample.resourceCount)),
}]));
const parityPairs = Array.from({ length: trialCount }, (_, trial) => {
	const left = samples.find((sample) => sample.trial === trial && sample.variant === variants[0].name);
	const right = samples.find((sample) => sample.trial === trial && sample.variant === variants[1].name);
	const equal = (left, right) => JSON.stringify(left) === JSON.stringify(right);
	return {
		trial,
		completeVisibleText: equal(left?.visibleText, right?.visibleText),
		title: equal(left?.title, right?.title),
		visibleControls: equal(left?.visibleControls, right?.visibleControls),
		htmlLang: equal(left?.htmlLangAtReady, right?.htmlLangAtReady),
		localeNavigation: !testLocaleNavigation || equal(left?.localeNavigation, right?.localeNavigation),
		pageErrors: !(left?.pageErrors?.length || right?.pageErrors?.length),
	};
});
const report = {
	date: new Date().toISOString(),
	browser: browser.version(),
	method: "Pinned Open WebUI production builds, /auth?lang=fr-FR with the same persisted locale key (locale=fr-FR) seeded before navigation in both variants, read-only /api/config fixture, no browser cache/service worker, Brotli-Q4 local static server, 80 ms RTT, 20 Mbps down / 2 Mbps up, 3x CPU. Readiness requires splash removed and French password/login text visible; LCP may still describe the splash, so it is diagnostic only. Variant roots can be supplied with OPENWEBUI_AB_VARIANTS for one-off controls.",
	trialCount,
	medianMethod: "Conventional median: for even sample counts, arithmetic mean of the two middle sorted values.",
	waitAfterReadyMs,
	testLocaleNavigation,
	variants,
	summary,
	parity: {
		pairCount: parityPairs.length,
		allPairsMatch: parityPairs.every((pair) => pair.completeVisibleText && pair.title && pair.visibleControls && pair.htmlLang && pair.localeNavigation),
		allTrialsErrorFree: parityPairs.every((pair) => pair.pageErrors),
		pairs: parityPairs,
	},
	bodyReductionPercent: Number(((summary[variants[0].name].bodyBytes - summary[variants[1].name].bodyBytes) / summary[variants[0].name].bodyBytes * 100).toFixed(3)),
	transferReductionPercent: Number(((summary[variants[0].name].transferBytes - summary[variants[1].name].transferBytes) / summary[variants[0].name].transferBytes * 100).toFixed(3)),
	readinessReductionPercent: Number(((summary[variants[0].name].readyMs - summary[variants[1].name].readyMs) / summary[variants[0].name].readyMs * 100).toFixed(3)),
	samples,
};
await fs.mkdir(path.dirname(outputFile), { recursive: true });
await fs.writeFile(outputFile, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ outputFile, summary, bodyReductionPercent: report.bodyReductionPercent, transferReductionPercent: report.transferReductionPercent, readinessReductionPercent: report.readinessReductionPercent, samples: samples.map(({ variant, trial, ready, translatedReadyMs, htmlLangAtReady, encodedBodyBytes, transferBytes, resourceCount, pageErrors }) => ({ variant, trial, ready, translatedReadyMs, htmlLangAtReady, encodedBodyBytes, transferBytes, resourceCount, pageErrors })) }, null, 2));
