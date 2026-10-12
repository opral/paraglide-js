import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { brotliCompressSync, constants as zlibConstants, gzipSync } from "node:zlib";
import { pathToFileURL } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "../..");
const playwrightModule =
	process.env.PLAYWRIGHT_MODULE ??
	path.resolve(repoRoot, "../paraglide-real-apps/benchmark/node_modules/playwright/index.mjs");
const { chromium } = await import(pathToFileURL(playwrightModule).href);
const scratch = "/root/repos-iii/paraglide-real-apps/.real-apps/memos-ab";
const nativeDist = path.resolve(process.env.MEMOS_NATIVE_DIST ?? path.join(scratch, "native-dist"));
const candidateDist = path.resolve(process.env.MEMOS_CANDIDATE_DIST ?? path.join(scratch, "candidate-dist"));
const trials = Number(process.env.MEMOS_TRIALS ?? 5);
const q4 = { params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 4 } };
const contentTypes = {
	".css": "text/css; charset=utf-8",
	".html": "text/html; charset=utf-8",
	".ico": "image/x-icon",
	".js": "text/javascript; charset=utf-8",
	".json": "application/json; charset=utf-8",
	".png": "image/png",
	".svg": "image/svg+xml",
	".webp": "image/webp",
	".woff": "font/woff",
	".woff2": "font/woff2",
	".ttf": "font/ttf",
};

function serveDist(root) {
	const server = http.createServer(async (request, response) => {
		const url = new URL(request.url ?? "/", "http://localhost");
		let pathname = decodeURIComponent(url.pathname);
		if (pathname === "/") pathname = "/index.html";
		let file = path.resolve(root, `.${pathname}`);
		if (!file.startsWith(`${root}${path.sep}`) && file !== path.join(root, "index.html")) {
			response.writeHead(403).end();
			return;
		}
		let body;
		try {
			body = await fs.readFile(file);
		} catch {
			if (path.extname(pathname)) {
				response.writeHead(404).end();
				return;
			}
			file = path.join(root, "index.html");
			body = await fs.readFile(file);
		}
		const headers = {
			"cache-control": "no-store",
			"content-type": contentTypes[path.extname(file)] ?? "application/octet-stream",
			vary: "accept-encoding",
		};
		if (request.headers["accept-encoding"]?.includes("br")) {
			body = brotliCompressSync(body, q4);
			headers["content-encoding"] = "br";
		}
		headers["content-length"] = body.byteLength;
		response.writeHead(200, headers).end(body);
	});
	return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve({ server, port: server.address().port })));
}

async function observeVariant({ label, origin, round }) {
	const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
	const context = await browser.newContext({
		locale: "fr-FR",
		viewport: { width: 1365, height: 900 },
		serviceWorkers: "block",
	});
	const page = await context.newPage();
	const cdp = await context.newCDPSession(page);
	await cdp.send("Network.enable");
	await cdp.send("Network.emulateNetworkConditions", {
		offline: false,
		latency: 80,
		downloadThroughput: 20 * 1024 * 1024 / 8,
		uploadThroughput: 5 * 1024 * 1024 / 8,
	});
	await cdp.send("Emulation.setCPUThrottlingRate", { rate: 3 });
	const errors = [];
	const apiMocks = [];
	const responses = [];
	console.log(`Memos route probe: ${label} round ${round}`);
	page.on("pageerror", (error) => errors.push(String(error)));
	page.on("console", (message) => {
		if (message.type() === "error") errors.push(`console: ${message.text()}`);
	});
	page.on("response", async (response) => {
		const request = response.request();
		const pathname = new URL(response.url()).pathname;
		try {
			const body = await response.body();
			responses.push({
				path: pathname,
				kind: request.resourceType(),
				status: response.status(),
				encodedBytes: Number(response.headers()["content-length"] ?? 0),
				bytes: body.byteLength,
				gzip: gzipSync(body).byteLength,
				brotliQ4: brotliCompressSync(body, q4).byteLength,
			});
		} catch {
			// Ignore an aborted response body; it cannot contribute to a completed page.
		}
	});
	await page.addInitScript(() => {
		window.__paint = { fcp: null, lcp: null };
		new PerformanceObserver((entries) => {
			for (const entry of entries.getEntries()) {
				if (entry.name === "first-contentful-paint") window.__paint.fcp = entry.startTime;
			}
		}).observe({ type: "paint", buffered: true });
		new PerformanceObserver((entries) => {
			for (const entry of entries.getEntries()) window.__paint.lcp = entry.startTime;
		}).observe({ type: "largest-contentful-paint", buffered: true });
	});
	await page.route("**/*", async (route) => {
		const pathname = new URL(route.request().url()).pathname;
		if (!pathname.startsWith("/memos.api.")) {
			await route.continue();
			return;
		}
		apiMocks.push(pathname);
		await route.fulfill({ status: 200, headers: { "content-type": "application/proto" }, body: Buffer.alloc(0) });
	});

	try {
		const started = performance.now();
		await page.goto(`${origin}/auth`, { waitUntil: "domcontentloaded" });
		await page.locator("h1").waitFor({ state: "visible", timeout: 20_000 });
		await page.waitForFunction(() => document.querySelector("h1")?.textContent?.trim() === "Connexion", null, { timeout: 20_000 });
		const pageReadyMs = performance.now() - started;
		await page.waitForLoadState("networkidle", { timeout: 10_000 });
		await page.waitForTimeout(150);
		const french = await page.evaluate(() => ({
			title: document.querySelector("h1")?.textContent?.trim(),
			locale: document.documentElement.lang,
			direction: document.documentElement.dir,
			text: document.body.innerText.trim().replace(/\n{2,}/g, "\n"),
			paint: window.__paint,
		}));
		const resourceTiming = await page.evaluate(() => {
			const navigation = performance.getEntriesByType("navigation")[0];
			const resources = performance.getEntriesByType("resource");
			const selected = resources.filter((entry) => {
				const type = new URL(entry.name).pathname.split(".").pop();
				return ["js", "css", "html", "woff", "woff2", "ttf", "png", "webp", "svg", "ico"].includes(type);
			});
			return {
				domContentLoadedMs: navigation?.domContentLoadedEventEnd,
				loadEventMs: navigation?.loadEventEnd,
				encodedTransferBytes: selected.reduce((sum, entry) => sum + entry.transferSize, 0),
				encodedBodyBytes: selected.reduce((sum, entry) => sum + entry.encodedBodySize, 0),
				resources: selected.map((entry) => ({ path: new URL(entry.name).pathname, transferSize: entry.transferSize, encodedBodySize: entry.encodedBodySize })),
			};
		});
		const startupResponses = responses.slice();

		const languageButton = page.locator('button:has(svg.lucide-globe)');
		await languageButton.click();
		const englishIndex = await page.locator('[role="option"]').evaluateAll((options) =>
			options.findIndex((option) => Array.from(option.querySelectorAll("span")).some((span) => span.textContent?.trim() === "en")),
		);
		if (englishIndex < 0) throw new Error("Locale picker did not expose the `en` option");
		await page.locator('[role="option"]').nth(englishIndex).click();
		try {
			await page.waitForFunction(
				() => document.documentElement.lang === "en" && document.querySelector("h1")?.textContent?.trim() === "Sign in",
				null,
				{ timeout: 10_000 },
			);
		} catch (error) {
			console.error(
				JSON.stringify({
					variant: label,
					selectedOption: await page.locator('[role="option"]').nth(englishIndex).textContent().catch(() => null),
					state: await page.evaluate(() => ({ lang: document.documentElement.lang, h1: document.querySelector("h1")?.textContent, buttons: [...document.querySelectorAll("button")].map((button) => button.innerText) })),
					pageErrors: errors,
				}),
			);
				throw error;
			}
		await page.keyboard.press("Escape");
		await page.locator('[role="option"]').waitFor({ state: "detached", timeout: 2_000 }).catch(() => {});
		const english = await page.evaluate(() => ({
			title: document.querySelector("h1")?.textContent?.trim(),
			locale: document.documentElement.lang,
			text: document.body.innerText.trim().replace(/\n{2,}/g, "\n"),
		}));
		if (errors.length) throw new Error(errors.join("\n"));
		const relevant = startupResponses.filter((response) => ["script", "stylesheet", "document", "font", "image"].includes(response.kind));
		const sum = (key) => relevant.reduce((total, response) => total + response[key], 0);
		return {
			variant: label,
			round,
			browser: browser.version(),
			conditions: { network: "20 Mbps down / 5 Mbps up / 80 ms latency; local Brotli Q4 assets", cpuSlowdown: 3 },
			pageReadyMs: Number(pageReadyMs.toFixed(1)),
			french,
			english,
			localeSwitchPassed: french.locale === "fr" && english.locale === "en",
			apiMocks,
			pageErrors: errors,
			resources: resourceTiming,
			resourceTotals: { requests: relevant.length, raw: sum("bytes"), gzip: sum("gzip"), brotliQ4: sum("brotliQ4") },
			responseDetails: relevant,
		};
	} finally {
		await context.close();
		await browser.close();
	}
}

const native = await serveDist(nativeDist);
const candidate = await serveDist(candidateDist);
try {
	const runs = [];
	for (let round = 1; round <= trials; round += 1) {
		const order = round % 2 === 1
			? [["native", `http://127.0.0.1:${native.port}`], ["compiled-route", `http://127.0.0.1:${candidate.port}`]]
			: [["compiled-route", `http://127.0.0.1:${candidate.port}`], ["native", `http://127.0.0.1:${native.port}`]];
		for (const [label, origin] of order) runs.push(await observeVariant({ label, origin, round }));
	}
	const parityChecks = [];
	for (let round = 1; round <= trials; round += 1) {
		const pair = runs.filter((run) => run.round === round);
		const nativeRun = pair.find((run) => run.variant === "native");
		const compiledRun = pair.find((run) => run.variant === "compiled-route");
		parityChecks.push({
			round,
			frenchExact: nativeRun?.french.text === compiledRun?.french.text,
			englishExact: nativeRun?.english.text === compiledRun?.english.text,
			localeSwitchBoth: nativeRun?.localeSwitchPassed && compiledRun?.localeSwitchPassed,
		});
	}
	const report = {
		app: "Memos web pinned at a668bb8f7e3652be029459bc80bd3bffb86f0542",
		compilerCatalog: "/root/repos-iii/paraglide-real-apps/.real-apps/memos/baseline (46 locales, 911 generated message functions; 2 plural-form keys excluded symmetrically by the catalog parity harness)",
		route: "/auth",
		method: "Alternating cold-browser native i18next and bounded compiled-route candidate; locale fr-FR; empty unary Connect protobuf API responses; exact body text parity required in French and after French-to-English switch.",
		limitations: [
			"The candidate is only a bounded /auth route integration; all other routes retain native i18next loading.",
			"Only literal keys in six auth route components are compiled; this is not a whole-app migration.",
			"The compiled message functions contain all 46 locales for each retained key.",
			"Transfer compression is local Brotli Q4 over same-origin static output; this does not model a production CDN cache or edge configuration.",
		],
		parityChecks,
		runs,
	};
	await fs.writeFile(path.join(scratch, "route-ab.json"), `${JSON.stringify(report, null, 2)}\n`);
	const median = (values) => {
		const sorted = [...values].sort((left, right) => left - right);
		return sorted[Math.floor(sorted.length / 2)];
	};
	const summaries = {};
	for (const variant of ["native", "compiled-route"]) {
		const variantRuns = runs.filter((run) => run.variant === variant);
		summaries[variant] = {
			medianPageReadyMs: Number(median(variantRuns.map((run) => run.pageReadyMs)).toFixed(1)),
			medianFcpMs: median(variantRuns.map((run) => run.french.paint.fcp)),
			medianLcpMs: median(variantRuns.map((run) => run.french.paint.lcp)),
			medianEncodedTransferBytes: median(variantRuns.map((run) => run.resources.encodedTransferBytes)),
			medianEncodedBodyBytes: median(variantRuns.map((run) => run.resources.encodedBodyBytes)),
			requestCount: variantRuns[0].resources.resources.length,
		};
	}
	const compactReport = {
		app: report.app,
		catalog: {
			locales: 46,
			includedKeys: 911,
			catalogHash: "32f4f680f203598f09a3eeb50be30c999da47dc2dedd2fe2153b7901a371c0f2",
			compilerArtifactHash: "22293e507afd8a594dfd5313694a6d2b9851cbf37bf9f0ce654db56144fd07d3",
		},
		route: report.route,
		method: report.method,
		conditions: runs[0]?.conditions,
		summaries,
		parityChecks,
		assets: Object.fromEntries(
			["native", "compiled-route"].map((variant) => [
				variant,
				runs.find((run) => run.variant === variant)?.resources.resources.map(({ path: assetPath, transferSize, encodedBodySize }) => ({
					path: assetPath,
					transferSize,
					encodedBodySize,
				})),
			]),
		),
		runs: runs.map((run) => ({
			variant: run.variant,
			round: run.round,
			pageReadyMs: run.pageReadyMs,
			fcpMs: run.french.paint.fcp,
			lcpMs: run.french.paint.lcp,
			encodedTransferBytes: run.resources.encodedTransferBytes,
			encodedBodyBytes: run.resources.encodedBodyBytes,
			frenchTitle: run.french.title,
			englishTitle: run.english.title,
			localeSwitchPassed: run.localeSwitchPassed,
			pageErrors: run.pageErrors,
		})),
		limitations: report.limitations,
	};
	const summaryPath = path.resolve(process.env.MEMOS_SUMMARY_PATH ?? path.join(repoRoot, "benchmark/real-apps/results/memos-auth-route-ab.json"));
	await fs.writeFile(summaryPath, `${JSON.stringify(compactReport, null, 2)}\n`);
	console.log(
		JSON.stringify(
			{
				...compactReport,
				runs: runs.map(({ responseDetails, resources, french, english, ...run }) => ({
					...run,
					french: { title: french.title, locale: french.locale, text: french.text },
					english: { title: english.title, locale: english.locale, text: english.text },
					resources: {
						encodedTransferBytes: resources.encodedTransferBytes,
						encodedBodyBytes: resources.encodedBodyBytes,
						requests: resources.resources.length,
					},
				})),
			},
			null,
			2,
		),
	);
} finally {
	native.server.close();
	candidate.server.close();
}
