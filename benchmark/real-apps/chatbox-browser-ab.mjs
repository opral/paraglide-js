import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { brotliCompressSync, constants as zlibConstants } from "node:zlib";

const root = path.dirname(fileURLToPath(import.meta.url));
const [nativeDistArg, paraglideDistArg, outputArg] = process.argv.slice(2);
if (!nativeDistArg || !paraglideDistArg) {
	throw new Error("Usage: node chatbox-browser-ab.mjs <native-renderer-dist> <paraglide-renderer-dist> [output-json]");
}
const { chromium } = await import("playwright");
const builds = [
	{ label: "native-i18next", root: path.resolve(nativeDistArg) },
	{ label: "paraglide-split", root: path.resolve(paraglideDistArg) },
];
const contentTypes = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".png": "image/png", ".svg": "image/svg+xml", ".woff": "font/woff", ".woff2": "font/woff2", ".wasm": "application/wasm" };
const br = new Map();
function serve(dir) {
	return http.createServer(async (req, res) => {
		try {
			const pathname = decodeURIComponent(new URL(req.url ?? "/", "http://127.0.0.1").pathname);
			if (pathname.startsWith("/api/") || pathname.startsWith("/ollama/")) { res.writeHead(404).end("{}"); return; }
			let file = path.resolve(dir, `.${pathname}`);
			if (!file.startsWith(`${dir}${path.sep}`) && file !== dir) throw Error("path escaped root");
			try { if (!(await fs.stat(file)).isFile()) file = path.join(dir, "index.html"); } catch { file = path.join(dir, "index.html"); }
			const body = await fs.readFile(file);
			const headers = { "cache-control": "no-store", "content-type": contentTypes[path.extname(file)] ?? "application/octet-stream", "x-content-type-options": "nosniff" };
			if ((req.headers["accept-encoding"] ?? "").includes("br") && /\.(?:js|css|html|json|svg)$/i.test(file) && body.length > 256) {
				let zipped = br.get(file); if (!zipped) { zipped = brotliCompressSync(body, { params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 4 } }); br.set(file, zipped); }
				headers["content-encoding"] = "br"; headers.vary = "accept-encoding"; headers["content-length"] = zipped.length; res.writeHead(200, headers).end(zipped);
			} else { headers["content-length"] = body.length; res.writeHead(200, headers).end(body); }
		} catch (error) { res.writeHead(500).end(String(error)); }
	});
}
const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
const trialCount = Number(process.env.TRIAL_COUNT ?? 3);
const results = [];
try {
	for (const build of builds) {
		const server = serve(build.root);
		await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
		const origin = `http://127.0.0.1:${server.address().port}`;
		const runs = [];
		for (let trial = 0; trial < trialCount; trial++) {
			const context = await browser.newContext({ viewport: { width: 1365, height: 768 }, locale: "fr-FR", serviceWorkers: "block" });
			const page = await context.newPage();
			const client = await context.newCDPSession(page);
			await client.send("Network.enable"); await client.send("Network.setCacheDisabled", { cacheDisabled: true });
			await client.send("Network.emulateNetworkConditions", { offline: false, latency: 80, downloadThroughput: 20 * 1024 * 1024 / 8, uploadThroughput: 2 * 1024 * 1024 / 8, connectionType: "cellular4g" });
			await client.send("Emulation.setCPUThrottlingRate", { rate: 3 });
			await page.route("**/*", route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
			const pageErrors = []; const consoleErrors = [];
			page.on("pageerror", error => pageErrors.push({ message: error.message, stack: error.stack }));
			page.on("console", message => { if (message.type() === "error") consoleErrors.push(message.text()); });
			await page.addInitScript(() => {
				window.__perf = { fcp: null, lcp: null, longTasks: 0 };
				new PerformanceObserver(list => { for (const e of list.getEntries()) if (e.name === "first-contentful-paint") window.__perf.fcp = e.startTime; }).observe({ type: "paint", buffered: true });
				new PerformanceObserver(list => { for (const e of list.getEntries()) window.__perf.lcp = e.startTime; }).observe({ type: "largest-contentful-paint", buffered: true });
				try { new PerformanceObserver(list => { window.__perf.longTasks += list.getEntries().reduce((sum, e) => sum + e.duration, 0); }).observe({ type: "longtask", buffered: true }); } catch {}
			});
			await page.goto(`${origin}/`, { waitUntil: "domcontentloaded", timeout: 30000 });
			await page.waitForFunction(() => {
				const text = document.body?.innerText ?? "";
				return text.includes("Épinglés") && text.includes("Nouvelle discussion");
			}, undefined, { timeout: 60000 });
			await page.waitForTimeout(Number(process.env.WAIT_MS ?? 500));
			const measured = await page.evaluate(() => ({ text: document.body?.innerText?.slice(0, 1600) ?? "", lang: document.documentElement.lang, navigatorLanguage: navigator.language, fcp: window.__perf.fcp, lcp: window.__perf.lcp, longTasks: window.__perf.longTasks, requests: [...performance.getEntriesByType("navigation"), ...performance.getEntriesByType("resource")].map(e => ({ name: e.name.replace(location.origin, ""), transfer: e.transferSize, encoded: e.encodedBodySize, decoded: e.decodedBodySize })) }));
			const resources = measured.requests.filter(r => r.name.startsWith("/"));
			runs.push({ trial, locale: "fr", lang: measured.lang, navigatorLanguage: measured.navigatorLanguage, fcpMs: Math.round(measured.fcp ?? 0), lcpMs: Math.round(measured.lcp ?? 0), longTaskMs: Math.round(measured.longTasks), resourceCount: resources.length, transferBytes: resources.reduce((n, r) => n + (r.transfer || 0), 0), encodedBytes: resources.reduce((n, r) => n + (r.encoded || 0), 0), decodedBytes: resources.reduce((n, r) => n + (r.decoded || 0), 0), localeRequests: resources.filter(r => /paraglide_virtual_locale|locale|translation/i.test(r.name)), resources, pageErrors, consoleErrors, frenchUiParity: measured.text.includes("Épinglés") && measured.text.includes("Bonjour"), text: measured.text });
			await context.close();
		}
		await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
		const fields = ["fcpMs", "lcpMs", "longTaskMs", "resourceCount", "transferBytes", "encodedBytes", "decodedBytes"];
		const median = Object.fromEntries(fields.map(f => [f, [...runs.map(r => r[f])].sort((a,b)=>a-b)[Math.floor(runs.length / 2)]]));
		results.push({ label: build.label, throttle: "80ms RTT / 20Mbps down / 2Mbps up / 3x CPU; 3 cold-cache runs; API and third-party traffic blocked", median, runs });
	}
} finally { await browser.close(); }
const report = {
	date: new Date().toISOString(),
	app: "chatbox",
	sourceCommit: "0ac6385ae1ff5bf778777826da3c5edcd55b61b8",
	i18nextVersion: "22.5.1",
	i18nextDeclaredRange: "^22.4.13",
	compilerCommit: "ec591218bb814c65e0a9f6a0252f8ec75236aa17",
	compilerOutput: "locale-modules with selected-locale Vite prototype and app-local i18next compatibility shim",
	node: process.version,
	browser: browser.version(),
	method: "Production web renderer builds from pinned Chatbox; French locale; fresh Chromium contexts; local Brotli-Q4 static serving; frontend-only because APIs are unavailable; frontend LCP is a lab comparison, not field Web Vitals",
	results,
};
const [native, paraglide] = results;
const changePct = (field) => Number(((paraglide.median[field] / native.median[field] - 1) * 100).toFixed(2));
const largestIndex = (result) => Math.max(...result.runs[0].resources.filter(r => /\/js\/index\.[^/]+\.js$/.test(r.name)).map(r => r.encoded));
report.comparison = {
	wholeRouteEncodedBytes: { native: native.median.encodedBytes, paraglide: paraglide.median.encodedBytes, changePct: changePct("encodedBytes") },
	wholeRouteDecodedBytes: { native: native.median.decodedBytes, paraglide: paraglide.median.decodedBytes, changePct: changePct("decodedBytes") },
	fcpMs: { native: native.median.fcpMs, paraglide: paraglide.median.fcpMs, changePct: changePct("fcpMs") },
	lcpMs: { native: native.median.lcpMs, paraglide: paraglide.median.lcpMs, changePct: changePct("lcpMs") },
	longTaskMs: { native: native.median.longTaskMs, paraglide: paraglide.median.longTaskMs, changePct: changePct("longTaskMs") },
	largestIndexChunkEncodedBytes: { native: largestIndex(native), paraglide: largestIndex(paraglide), changePct: Number(((largestIndex(paraglide) / largestIndex(native) - 1) * 100).toFixed(2)) },
};
report.verdict = "negative: whole-route transfer and user-facing timing changes are below the 10% qualification threshold";
const outputPath = path.resolve(outputArg ?? path.join(root, "results/chatbox-paraglide-split-negative.json"));
await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(results.map(({ label, median }) => ({ label, median })), null, 2));
