import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { brotliCompressSync, constants as zlibConstants } from "node:zlib";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "../..");
const resultPath = path.resolve(
	process.env.DRAWDB_BROWSER_REPORT ??
		path.join(repoRoot, ".real-apps/drawdb/app-browser-results.json")
);
const outputRoot = path.resolve(
	process.env.DRAWDB_OUTPUT ?? path.join(repoRoot, ".real-apps/drawdb")
);
const labels = (process.env.DRAWDB_VARIANTS ?? "baseline,inline").split(",");
if (labels.some((label) => !/^[a-z0-9-]+$/.test(label)))
	throw Error("Invalid variant label");
const variants = ["native", ...labels].map((label, index) => ({
	name: label === "native" ? label : `paraglide-${label}`,
	dir: path.join(outputRoot, `app-${label}/dist`),
	port: 4181 + index,
}));
const locales = ["en", "de", "pa-PK"];
const routes = ["/", "/editor"];
const trials = Number(process.env.DRAWDB_BROWSER_TRIALS ?? 3);
const servers = [];

const contentTypes = {
	".css": "text/css; charset=utf-8",
	".html": "text/html; charset=utf-8",
	".ico": "image/x-icon",
	".js": "text/javascript; charset=utf-8",
	".json": "application/json; charset=utf-8",
	".png": "image/png",
	".svg": "image/svg+xml",
	".woff": "font/woff",
	".woff2": "font/woff2",
};

async function startServer(variant) {
	const root = path.resolve(variant.dir);
	const compressed = new Map();
	await fs.access(path.join(root, "index.html"));
	const server = http.createServer(async (request, response) => {
		try {
			const pathname = decodeURIComponent(
				new URL(request.url ?? "/", "http://localhost").pathname
			);
			let filename = path.resolve(root, `.${pathname}`);
			if (!filename.startsWith(`${root}${path.sep}`) && filename !== root)
				throw new Error("Path escaped app dist");
			try {
				if (!(await fs.stat(filename)).isFile())
					filename = path.join(root, "index.html");
			} catch {
				filename = path.join(root, "index.html");
			}
			const body = await fs.readFile(filename);
			const headers = {
				"cache-control": "no-store",
				"content-type":
					contentTypes[path.extname(filename)] ?? "application/octet-stream",
				"x-content-type-options": "nosniff",
			};
			if ((request.headers["accept-encoding"] ?? "").includes("br")) {
				headers["content-encoding"] = "br";
				headers.vary = "accept-encoding";
				let encoded = compressed.get(filename);
				if (!encoded) {
					encoded = brotliCompressSync(body, {
						params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 4 },
					});
					compressed.set(filename, encoded);
				}
				headers["content-length"] = encoded.byteLength;
				response.writeHead(200, headers).end(encoded);
			} else response.writeHead(200, headers).end(body);
		} catch {
			response.writeHead(500).end("local fixture server error");
		}
	});
	await new Promise((resolve) =>
		server.listen(variant.port, "127.0.0.1", resolve)
	);
	servers.push(server);
}

try {
	for (const variant of variants) await startServer(variant);
	const browser = await chromium.launch({ headless: true });
	const results = [];
	const texts = new Map();
	for (let trial = 0; trial < trials; trial++) {
		for (const locale of locales) {
			for (const routePath of routes) {
				const rotation =
					(trial + locales.indexOf(locale) + routes.indexOf(routePath)) %
					variants.length;
				const order = [
					...variants.slice(rotation),
					...variants.slice(0, rotation),
				];
				for (const variant of order) {
					const context = await browser.newContext({
						viewport: { width: 1365, height: 768 },
					});
					console.log(
						`Trial ${trial + 1}/${trials}: ${variant.name} ${locale} ${routePath}`
					);
					await context.addInitScript((selectedLocale) => {
						localStorage.setItem("i18nextLng", selectedLocale);
					}, locale);
					const page = await context.newPage();
					const client = await context.newCDPSession(page);
					await client.send("Network.enable");
					await client.send("Network.setCacheDisabled", {
						cacheDisabled: true,
					});
					await client.send("Network.emulateNetworkConditions", {
						offline: false,
						latency: 80,
						downloadThroughput: (20 * 1024 * 1024) / 8,
						uploadThroughput: (2 * 1024 * 1024) / 8,
						connectionType: "cellular4g",
					});
					await client.send("Emulation.setCPUThrottlingRate", { rate: 3 });
					const origin = `http://127.0.0.1:${variant.port}`;
					await page.route("**/*", (requestRoute) => {
						if (new URL(requestRoute.request().url()).origin !== origin)
							return requestRoute.abort();
						return requestRoute.continue();
					});
					const errors = [];
					page.on("pageerror", (error) => errors.push(error.message));
					const responses = [];
					page.on("response", (response) => {
						if (new URL(response.url()).origin === origin)
							responses.push({
								url: response.url(),
								status: response.status(),
								bytes: Number(response.headers()["content-length"] ?? 0),
							});
					});
					await page.addInitScript(() => {
						window.__perf = { fcp: null, lcp: null, longTaskMs: 0 };
						new PerformanceObserver((list) => {
							for (const entry of list.getEntries()) {
								if (entry.name === "first-contentful-paint")
									window.__perf.fcp = entry.startTime;
							}
						}).observe({ type: "paint", buffered: true });
						new PerformanceObserver((list) => {
							for (const entry of list.getEntries())
								window.__perf.lcp = entry.startTime;
						}).observe({ type: "largest-contentful-paint", buffered: true });
						try {
							new PerformanceObserver((list) => {
								window.__perf.longTaskMs += list
									.getEntries()
									.reduce((sum, entry) => sum + entry.duration, 0);
							}).observe({ type: "longtask", buffered: true });
						} catch {}
					});
					const started = performance.now();
					await page.goto(`${origin}${routePath}`, {
						waitUntil: "domcontentloaded",
						timeout: 30000,
					});
					await page.waitForFunction(
						() =>
							(document.querySelector("#root")?.innerText.trim().length ?? 0) >
							30,
						{ timeout: 30000 }
					);
					// Sample after a fixed rendering window; do not wait for analytics or remote embeds.
					await page.waitForTimeout(1500);
					const sample = await page.evaluate(() => ({
						text: document.querySelector("#root")?.innerText.trim() ?? "",
						perf: window.__perf,
					}));
					const resourceBytes = await page.evaluate(() =>
						performance
							.getEntriesByType("resource")
							.filter((entry) => entry.name.startsWith(location.origin))
							.reduce((sum, entry) => sum + (entry.transferSize || 0), 0)
					);
					results.push({
						variant: variant.name,
						trial,
						locale,
						route: routePath,
						elapsedToSampleMs: Math.round(performance.now() - started),
						fcpMs: Math.round(sample.perf.fcp ?? 0),
						lcpMs: Math.round(sample.perf.lcp ?? 0),
						longTaskMs: Math.round(sample.perf.longTaskMs),
						resourceTransferBytes: resourceBytes,
						textChars: sample.text.length,
						text: sample.text,
						pageErrors: errors,
						localResponses: responses,
					});
					texts.set(
						`${variant.name}|${trial}|${locale}|${routePath}`,
						sample.text
					);
					await context.close();
				}
			}
		}
	}
	await browser.close();
	const parity = [];
	for (let trial = 0; trial < trials; trial++) {
		for (const locale of locales) {
			for (const routePath of routes) {
				const baseline = texts.get(`native|${trial}|${locale}|${routePath}`);
				for (const variant of variants.slice(1)) {
					const actual = texts.get(
						`${variant.name}|${trial}|${locale}|${routePath}`
					);
					parity.push({
						trial,
						locale,
						route: routePath,
						variant: variant.name,
						equal: actual === baseline,
						baseChars: baseline.length,
						actualChars: actual.length,
						firstDifference:
							actual === baseline
								? null
								: Math.min(
										[...baseline].findIndex((char, i) => actual[i] !== char),
										[...actual].findIndex((char, i) => baseline[i] !== char)
									),
					});
				}
			}
		}
	}
	const median = (values) => {
		const sorted = [...values].sort((a, b) => a - b);
		return sorted[Math.floor(sorted.length / 2)];
	};
	const summary = variants.flatMap((variant) =>
		routes.map((routePath) => {
			const rows = results.filter(
				(result) =>
					result.variant === variant.name && result.route === routePath
			);
			return {
				variant: variant.name,
				route: routePath,
				observations: rows.length,
				medianFcpMs: median(rows.map((row) => row.fcpMs)),
				medianLcpMs: median(rows.map((row) => row.lcpMs)),
				medianLongTaskMs: median(rows.map((row) => row.longTaskMs)),
				medianResourceTransferBytes: median(
					rows.map((row) => row.resourceTransferBytes)
				),
			};
		})
	);
	const report = {
		browserVersion: browser.version(),
		network: { latencyMs: 80, downloadMbps: 20, uploadMbps: 2 },
		cpuThrottle: 3,
		trials,
		fixedPostRenderWaitMs: 1500,
		results,
		summary,
		parity,
	};
	await fs.mkdir(path.dirname(resultPath), { recursive: true });
	await fs.writeFile(resultPath, `${JSON.stringify(report, null, 2)}\n`);
	console.log(`Wrote ${resultPath}`);
	for (const result of summary) {
		console.log(
			`${result.variant.padEnd(18)} ${result.route.padEnd(8)} median FCP ${String(result.medianFcpMs).padStart(5)}ms LCP ${String(result.medianLcpMs).padStart(5)}ms bytes ${String(result.medianResourceTransferBytes).padStart(8)} n=${result.observations}`
		);
	}
	const mismatches = parity.filter((item) => !item.equal);
	if (mismatches.length)
		throw Error(`Visible-text parity failures: ${JSON.stringify(mismatches)}`);
} finally {
	for (const server of servers) server.close();
}
