import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { brotliCompressSync, constants as zlibConstants } from "node:zlib";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const [nativeDistArg, paraglideDistArg, outputArg] = process.argv.slice(2);
if (!nativeDistArg || !paraglideDistArg) {
	throw new Error("Usage: node ntfy-browser-ab.mjs <native-dist> <paraglide-dist> [output-json]");
}
const playwrightModule = process.env.PLAYWRIGHT_MODULE ??
	"/root/repos-iii/paraglide-client-split-pr4/benchmark/node_modules/playwright/index.mjs";
const { chromium } = await import(pathToFileURL(playwrightModule).href);
const builds = [
	{ label: "optimized-i18next", root: path.resolve(nativeDistArg) },
	{ label: "paraglide-per-locale-build", root: path.resolve(paraglideDistArg) },
];
const contentTypes = {
	".css": "text/css; charset=utf-8",
	".html": "text/html; charset=utf-8",
	".ico": "image/x-icon",
	".js": "text/javascript; charset=utf-8",
	".json": "application/json; charset=utf-8",
	".png": "image/png",
	".svg": "image/svg+xml",
	".woff2": "font/woff2",
};
const brCache = new Map();
function serve(root) {
	return http.createServer(async (request, response) => {
		try {
			const pathname = decodeURIComponent(new URL(request.url ?? "/", "http://127.0.0.1").pathname);
			if (pathname.startsWith("/api/") || pathname.startsWith("/v1/")) {
				response.writeHead(404, { "content-type": "application/json" }).end("{}");
				return;
			}
			let filename = path.resolve(root, `.${pathname}`);
			if (!filename.startsWith(`${root}${path.sep}`) && filename !== root) throw new Error("path escaped dist");
			try { if (!(await fs.stat(filename)).isFile()) filename = path.join(root, "index.html"); }
			catch { filename = path.join(root, "index.html"); }
			const source = await fs.readFile(filename);
			const headers = {
				"cache-control": "no-store",
				"content-type": contentTypes[path.extname(filename)] ?? "application/octet-stream",
				"x-content-type-options": "nosniff",
			};
			if ((request.headers["accept-encoding"] ?? "").includes("br") && /\.(?:js|css|html|json|svg)$/i.test(filename) && source.length > 256) {
				let encoded = brCache.get(filename);
				if (!encoded) {
					encoded = brotliCompressSync(source, { params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 4 } });
					brCache.set(filename, encoded);
				}
				headers["content-encoding"] = "br";
				headers.vary = "accept-encoding";
				headers["content-length"] = encoded.length;
				response.writeHead(200, headers).end(encoded);
			} else {
				headers["content-length"] = source.length;
				response.writeHead(200, headers).end(source);
			}
		} catch (error) {
			response.writeHead(500).end(String(error));
		}
	});
}

const trialCount = Number(process.env.TRIAL_COUNT ?? 10);
const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
const servers = await Promise.all(builds.map(async (build) => {
	const server = serve(build.root);
	await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
	return { build, server, origin: `http://127.0.0.1:${server.address().port}` };
}));
const runsByLabel = new Map(builds.map((build) => [build.label, []]));
try {
	for (let trial = 0; trial < trialCount; trial++) {
		const order = trial % 2 === 0 ? servers : [...servers].reverse();
		for (const { build, origin } of order) {
			const runs = runsByLabel.get(build.label);
			const context = await browser.newContext({ viewport: { width: 1365, height: 768 }, locale: "fr-FR", serviceWorkers: "block" });
			const page = await context.newPage();
			const client = await context.newCDPSession(page);
			await client.send("Network.enable");
			const dependencyInitiators = [];
			if (process.env.TRACE_NTFY_DEPENDENCIES === "1") {
				client.on("Network.requestWillBeSent", (event) => {
					if (!/\/(?:Close|EmojiPicker)-[^/]+\.js(?:$|\?)/.test(event.request.url)) return;
					dependencyInitiators.push({
						url: new URL(event.request.url).pathname,
						type: event.initiator.type,
						stack: event.initiator.stack?.callFrames?.slice(0, 5).map(({ functionName, url, lineNumber, columnNumber }) => ({ functionName, url, lineNumber, columnNumber })) ?? [],
					});
				});
			}
			await client.send("Network.setCacheDisabled", { cacheDisabled: true });
			await client.send("Network.emulateNetworkConditions", {
				offline: false,
				latency: 80,
				downloadThroughput: (20 * 1024 * 1024) / 8,
				uploadThroughput: (2 * 1024 * 1024) / 8,
				connectionType: "cellular4g",
			});
			await client.send("Emulation.setCPUThrottlingRate", { rate: 3 });
			await page.route("**/*", (route) => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
			const pageErrors = [];
			const failedRequests = [];
			page.on("pageerror", (error) => pageErrors.push(error.message));
			page.on("requestfailed", (request) => failedRequests.push({ url: request.url(), error: request.failure()?.errorText }));
			await page.addInitScript(() => {
				localStorage.setItem("i18nextLng", "fr");
				window.__routePerf = { fcp: null, lcp: null, longTaskMs: 0 };
				new PerformanceObserver((list) => {
					for (const entry of list.getEntries()) if (entry.name === "first-contentful-paint") window.__routePerf.fcp = entry.startTime;
				}).observe({ type: "paint", buffered: true });
				new PerformanceObserver((list) => {
					for (const entry of list.getEntries()) window.__routePerf.lcp = entry.startTime;
				}).observe({ type: "largest-contentful-paint", buffered: true });
				try {
					new PerformanceObserver((list) => {
						window.__routePerf.longTaskMs += list.getEntries().reduce((sum, entry) => sum + entry.duration, 0);
					}).observe({ type: "longtask", buffered: true });
				} catch {}
			});
			const start = Date.now();
			await page.goto(`${origin}/login`, { waitUntil: "domcontentloaded", timeout: 30000 });
			let readinessError = null;
			try {
				await page.waitForFunction(() => {
					const splash = document.querySelector("#splash");
					const visible = (el) => {
						if (!el) return false;
						const rect = el.getBoundingClientRect();
						const style = getComputedStyle(el);
						return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
					};
					const bodyText = document.body?.innerText ?? "";
					const username = document.querySelector("#username");
					const password = document.querySelector("#password");
					const submit = [...document.querySelectorAll("button")].find((el) => el.textContent.toLowerCase().includes("se connecter"));
					const splashGone = !splash || getComputedStyle(splash).opacity === "0";
					return splashGone && bodyText.includes("Se connecter à son compte Ntfy") &&
						bodyText.includes("Username or email") && bodyText.includes("Mot de passe") &&
						bodyText.includes("Se connecter") && visible(username) && visible(password) && visible(submit);
				}, undefined, { timeout: 30000 });
			} catch (error) {
				readinessError = error.message;
			}
			const sample = await page.evaluate(() => {
				const splash = document.querySelector("#splash");
				const visibleText = document.body?.innerText?.slice(0, 1200) ?? "";
				return {
					visibleText,
					htmlLang: document.documentElement.lang,
					splashOpacity: splash ? getComputedStyle(splash).opacity : null,
					splashExists: !!splash,
					fcpMs: window.__routePerf.fcp,
					lcpMs: window.__routePerf.lcp,
					longTaskMs: window.__routePerf.longTaskMs,
					requests: [
						...performance.getEntriesByType("navigation").map((entry) => ({ name: entry.name.replace(location.origin, ""), transferBytes: entry.transferSize, encodedBytes: entry.encodedBodySize, decodedBytes: entry.decodedBodySize })),
						...performance.getEntriesByType("resource").map((entry) => ({ name: entry.name.replace(location.origin, ""), transferBytes: entry.transferSize, encodedBytes: entry.encodedBodySize, decodedBytes: entry.decodedBodySize })),
					],
				};
			});
			const resources = sample.requests.filter((item) => item.name.startsWith("/"));
			runs.push({
				trial,
				locale: "fr",
				htmlLang: sample.htmlLang,
				ready: !readinessError,
				readinessError,
				readyMsFromNavigation: Date.now() - start,
				frenchLoginParity: sample.visibleText.includes("Se connecter à son compte Ntfy") &&
					sample.visibleText.includes("Username or email") && sample.visibleText.includes("Mot de passe") &&
					sample.visibleText.includes("Se connecter"),
				splashOpacity: sample.splashOpacity,
				splashExists: sample.splashExists,
				fcpMs: Math.round(sample.fcpMs ?? 0),
				lcpMs: Math.round(sample.lcpMs ?? 0),
				longTaskMs: Math.round(sample.longTaskMs),
				resourceCount: resources.length,
				transferBytes: resources.reduce((n, item) => n + (item.transferBytes || 0), 0),
				encodedBytes: resources.reduce((n, item) => n + (item.encodedBytes || 0), 0),
				decodedBytes: resources.reduce((n, item) => n + (item.decodedBytes || 0), 0),
				translationRequests: resources.filter((item) => /langs\/|locale(?:_|\/)|_paraglide_client-locale-split_locale/i.test(item.name)),
				dependencyInitiators,
				resources,
				pageErrors,
				failedRequests,
				visibleText: sample.visibleText,
			});
			await context.close();
		}
	}
} finally {
	await browser.close();
	await Promise.all(servers.map(({ server }) => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))));
}

const fields = ["readyMsFromNavigation", "fcpMs", "lcpMs", "longTaskMs", "resourceCount", "transferBytes", "encodedBytes", "decodedBytes"];
const median = (values) => {
	const sorted = [...values].sort((a, b) => a - b);
	const middle = Math.floor(sorted.length / 2);
	return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
};
const results = builds.map((build) => {
	const runs = runsByLabel.get(build.label);
	const medians = Object.fromEntries(fields.map((field) => {
		return [field, median(runs.map((run) => run[field]))];
	}));
	return { label: build.label, median: medians, runs };
});
const [baseline, candidate] = results;
const delta = (field) => Number(((candidate.median[field] / baseline.median[field] - 1) * 100).toFixed(2));
const report = {
	date: new Date().toISOString(),
	app: "ntfy",
	sourceCommit: "211ba22860d7483073a8ce13dcda5f467194989b",
	i18nextVersion: "26.4.2",
	compilerWorktreeCommit: "6997d020813d76f087d585110e62cd54891726e0",
	paraglidePluginWorktreeCommit: "6997d020813d76f087d585110e62cd54891726e0",
	method: "Fresh Chromium contexts; French localStorage preference and preselected French build served at the origin root; Brotli-Q4 local serving; cache disabled, service workers blocked, 80 ms RTT / 20 Mbps down / 2 Mbps up / 3x CPU; API traffic blocked; readiness requires splash opacity 0/removed and translated login UI visible.",
	limitations: [
		"This uses an app-local i18next/React-i18next compatibility adapter over generated messages and a static literal-call codemod; it is an experiment, not a supported migration API.",
		"Service workers are blocked and cache disabled. The specialized foreground graph is measured; the separately built PWA worker retains multiple locales. Install/offline and full-document language switching are not validated.",
		"The app imposes a 1,000 ms minimum splash duration plus a 300 ms logo fade and 100 ms background fade. First content paint often reflects the static splash, so route readiness is the more relevant user-facing measure.",
		"FCP/LCP are the static splash rather than the translated login view and are excluded from the >=10% qualification gate.",
		"Native frontend build artifacts were captured before modifying the isolated app worktree; this comparison covers /login and its requested asset graph, not every account/notification route.",
	],
	results,
	comparison: Object.fromEntries(fields.map((field) => [field, { baseline: baseline.median[field], candidate: candidate.median[field], changePct: delta(field) }])),
	allRunsReady: results.every((result) => result.runs.every((run) => run.ready)),
	allRunsFrenchParity: results.every((result) => result.runs.every((run) => run.frenchLoginParity)),
	anyPageErrors: results.some((result) => result.runs.some((run) => run.pageErrors.length)),
	performanceGate: {
		readyTimeImprovementPct: Number(((baseline.median.readyMsFromNavigation - candidate.median.readyMsFromNavigation) / baseline.median.readyMsFromNavigation * 100).toFixed(2)),
		encodedRouteBytesImprovementPct: Number(((baseline.median.encodedBytes - candidate.median.encodedBytes) / baseline.median.encodedBytes * 100).toFixed(2)),
		minimumImprovementPct: 10,
		qualifies: false,
	},
	verdict: "",
};
report.performanceGate.qualifies = report.allRunsReady && report.allRunsFrenchParity && !report.anyPageErrors &&
	(report.performanceGate.readyTimeImprovementPct >= report.performanceGate.minimumImprovementPct ||
		report.performanceGate.encodedRouteBytesImprovementPct >= report.performanceGate.minimumImprovementPct);
report.verdict = !report.allRunsReady || !report.allRunsFrenchParity || report.anyPageErrors
	? "Readiness/parity failure; not a valid performance result."
	: report.performanceGate.qualifies
		? "At least one measured user-facing route metric clears the >=10% gate."
		: "No >=10% full-route readiness or encoded-byte improvement; candidate does not qualify.";
const output = path.resolve(outputArg ?? path.join(scriptDir, "results/ntfy-paraglide-ab.json"));
await fs.mkdir(path.dirname(output), { recursive: true });
await fs.writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ results: results.map(({ label, median, runs }) => ({ label, median, ready: runs.every((run) => run.ready), frenchParity: runs.every((run) => run.frenchLoginParity), errors: runs.flatMap((run) => run.pageErrors) })), comparison: report.comparison, verdict: report.verdict }, null, 2));
