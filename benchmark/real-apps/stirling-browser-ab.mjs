import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { brotliCompressSync, constants as zlibConstants } from "node:zlib";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const [nativeDistArg, paraglideDistArg, outputArg] = process.argv.slice(2);
if (!nativeDistArg || !paraglideDistArg) {
	throw new Error("Usage: node stirling-browser-ab.mjs <native-dist> <paraglide-dist> [output-json]");
}
const playwrightModule = process.env.PLAYWRIGHT_MODULE ?? path.resolve(scriptDir, "../../benchmark/node_modules/playwright/index.mjs");
const { chromium } = await import(pathToFileURL(playwrightModule).href);
const builds = [
	{ label: process.env.BASELINE_LABEL ?? "native-i18next", root: path.resolve(nativeDistArg) },
	{ label: process.env.PARAGLIDE_LABEL ?? "paraglide-static-locale-split", root: path.resolve(paraglideDistArg) },
];
const contentTypes = {
	".css": "text/css; charset=utf-8",
	".html": "text/html; charset=utf-8",
	".ico": "image/x-icon",
	".js": "text/javascript; charset=utf-8",
	".json": "application/json; charset=utf-8",
	".png": "image/png",
	".svg": "image/svg+xml",
	".toml": "text/plain; charset=utf-8",
	".woff2": "font/woff2",
};
const brCache = new Map();
function serve(root) {
	return http.createServer(async (request, response) => {
		try {
			const pathname = decodeURIComponent(new URL(request.url ?? "/", "http://127.0.0.1").pathname);
			if (pathname.startsWith("/api/") || pathname.startsWith("/oauth2") || pathname.startsWith("/saml2")) {
				response.writeHead(404, { "content-type": "application/json" }).end("{}");
				return;
			}
			let filename = path.resolve(root, `.${pathname}`);
			if (!filename.startsWith(`${root}${path.sep}`) && filename !== root) throw new Error("path escaped dist");
			try { if (!(await fs.stat(filename)).isFile()) filename = path.join(root, "index.html"); }
			catch { filename = path.join(root, "index.html"); }
			const source = await fs.readFile(filename);
			const headers = { "cache-control": "no-store", "content-type": contentTypes[path.extname(filename)] ?? "application/octet-stream", "x-content-type-options": "nosniff" };
			if ((request.headers["accept-encoding"] ?? "").includes("br") && /\.(?:js|css|html|json|svg|toml)$/i.test(filename) && source.length > 256) {
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
		} catch (error) { response.writeHead(500).end(String(error)); }
	});
}
const trialCount = Number(process.env.TRIAL_COUNT ?? 3);
const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
const servers = await Promise.all(builds.map(async (build) => {
	const server = serve(build.root);
	await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
	return { build, server, origin: `http://127.0.0.1:${server.address().port}` };
}));
const runsByLabel = new Map(builds.map((build) => [build.label, []]));
try {
	for (let trial = 0; trial < trialCount; trial++) {
		// Pair cold runs and alternate order to reduce host-load/order bias.
		const order = trial % 2 === 0 ? servers : [...servers].reverse();
		for (const { build, origin } of order) {
			const runs = runsByLabel.get(build.label);
			const context = await browser.newContext({ viewport: { width: 1365, height: 768 }, locale: "fr-FR", serviceWorkers: "block" });
			const page = await context.newPage();
			const client = await context.newCDPSession(page);
			await client.send("Network.enable");
			await client.send("Network.setCacheDisabled", { cacheDisabled: true });
			await client.send("Network.emulateNetworkConditions", { offline: false, latency: 80, downloadThroughput: (20 * 1024 * 1024) / 8, uploadThroughput: (2 * 1024 * 1024) / 8, connectionType: "cellular4g" });
			await client.send("Emulation.setCPUThrottlingRate", { rate: 3 });
			await page.route("**/*", (route) => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
			const pageErrors = [];
			page.on("pageerror", (error) => pageErrors.push(error.message));
			await page.addInitScript(() => {
				window.__routePerf = { fcp: null, lcp: null, longTaskMs: 0 };
				new PerformanceObserver((list) => { for (const entry of list.getEntries()) if (entry.name === "first-contentful-paint") window.__routePerf.fcp = entry.startTime; }).observe({ type: "paint", buffered: true });
				new PerformanceObserver((list) => { for (const entry of list.getEntries()) window.__routePerf.lcp = entry.startTime; }).observe({ type: "largest-contentful-paint", buffered: true });
				try { new PerformanceObserver((list) => { window.__routePerf.longTaskMs += list.getEntries().reduce((sum, entry) => sum + entry.duration, 0); }).observe({ type: "longtask", buffered: true }); } catch {}
			});
			await page.goto(origin, { waitUntil: "domcontentloaded", timeout: 30000 });
			let parityWaitError = null;
			try {
				await page.waitForFunction(() => {
					const text = document.body?.innerText ?? "";
					return text.includes("Bibliothèque PDF") && text.includes("Aucun fichier pour le moment") && text.includes("Ajouter des fichiers");
				}, undefined, { timeout: 45000 });
			} catch (error) { parityWaitError = error.message; }
			await page.waitForTimeout(750);
			const sample = await page.evaluate(() => ({
				text: document.body?.innerText?.slice(0, 1800) ?? "",
				htmlLang: document.documentElement.lang,
				fcpMs: window.__routePerf.fcp,
				lcpMs: window.__routePerf.lcp,
				longTaskMs: window.__routePerf.longTaskMs,
				requests: [
					...performance.getEntriesByType("navigation").map((entry) => ({ name: entry.name.replace(location.origin, ""), transferBytes: entry.transferSize, encodedBytes: entry.encodedBodySize, decodedBytes: entry.decodedBodySize })),
					...performance.getEntriesByType("resource").map((entry) => ({ name: entry.name.replace(location.origin, ""), transferBytes: entry.transferSize, encodedBytes: entry.encodedBodySize, decodedBytes: entry.decodedBodySize })),
				],
			}));
			const resources = sample.requests.filter((item) => item.name.startsWith("/"));
			runs.push({
				trial,
				locale: "fr-FR",
				htmlLang: sample.htmlLang,
				frenchUiParity: sample.text.includes("Bibliothèque PDF") && sample.text.includes("Aucun fichier pour le moment") && sample.text.includes("Ajouter des fichiers"),
				parityWaitError,
				fcpMs: Math.round(sample.fcpMs ?? 0),
				lcpMs: Math.round(sample.lcpMs ?? 0),
				longTaskMs: Math.round(sample.longTaskMs),
				resourceCount: resources.length,
				transferBytes: resources.reduce((n, item) => n + (item.transferBytes || 0), 0),
				encodedBytes: resources.reduce((n, item) => n + (item.encodedBytes || 0), 0),
				decodedBytes: resources.reduce((n, item) => n + (item.decodedBytes || 0), 0),
				localeRequests: resources.filter((item) => /paraglide.*locale|locales\/|translation\.toml/i.test(item.name)),
				resources,
				pageErrors,
				text: sample.text,
			});
			await context.close();
		}
	}
} finally {
	await browser.close();
	await Promise.all(servers.map(({ server }) => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))));
}
const fields = ["fcpMs", "lcpMs", "longTaskMs", "resourceCount", "transferBytes", "encodedBytes", "decodedBytes"];
const results = builds.map((build) => {
	const runs = runsByLabel.get(build.label);
	const median = Object.fromEntries(fields.map((field) => {
		const values = runs.map((run) => run[field]).sort((a, b) => a - b);
		return [field, values[Math.floor(values.length / 2)]];
	}));
	return { label: build.label, median, runs };
});
const [baseline, candidate] = results;
const delta = (field) => Number(((candidate.median[field] / baseline.median[field] - 1) * 100).toFixed(2));
for (let trial = 0; trial < trialCount; trial++) {
	candidate.runs[trial].sameVisibleText = candidate.runs[trial].text === baseline.runs[trial].text;
}
const report = {
	date: new Date().toISOString(),
	app: "Stirling-PDF",
	sourceCommit: "313794c573df5e92d2f020f5ec53d08b264d6e4f",
	i18nextVersion: "26.3.6",
	compilerCommit: process.env.COMPILER_COMMIT ?? "ec591218bb814c65e0a9f6a0252f8ec75236aa17",
	...(process.env.BASELINE_PLUGIN_COMMIT ? { baselinePluginCommit: process.env.BASELINE_PLUGIN_COMMIT } : {}),
	...(process.env.CANDIDATE_PLUGIN_COMMIT ? { candidatePluginCommit: process.env.CANDIDATE_PLUGIN_COMMIT } : {}),
	method: process.env.METHOD ?? "Pinned production Vite 7.3.6 client, fresh Chromium contexts, French selected locale, Brotli-Q4 local serving, 80 ms RTT / 20 Mbps down / 2 Mbps up / 3x CPU; API and third-party traffic blocked; frontend-only lab LCP",
	results,
	comparisonLabels: { baseline: baseline.label, candidate: candidate.label },
	comparison: Object.fromEntries(["fcpMs", "lcpMs", "longTaskMs", "transferBytes", "encodedBytes", "decodedBytes"].map((field) => [field, {
		baseline: baseline.median[field],
		candidate: candidate.median[field],
		changePct: delta(field),
		pairedMedianChangePct: Number((candidate.runs.map((run, index) => (run[field] / baseline.runs[index][field] - 1) * 100).sort((a, b) => a - b)[Math.floor(trialCount / 2)]).toFixed(2)),
	}])),
	visibleTextMatchesBaseline: candidate.runs.every((run) => run.sameVisibleText),
	verdict: "",
};
report.verdict = candidate.runs.every((run) => run.frenchUiParity && run.sameVisibleText && !run.pageErrors.length)
	? "Measured; evaluate whole-route and timing changes against the >=10% qualification gate."
	: "Parity/build failure; not a valid positive performance result.";
const output = path.resolve(outputArg ?? path.join(scriptDir, "results/stirling-paraglide-ab.json"));
await fs.writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ results: results.map((item) => ({ label: item.label, median: item.median, frenchUiParity: item.runs.every((run) => run.frenchUiParity) })), verdict: report.verdict }, null, 2));
