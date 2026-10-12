import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { brotliCompressSync, constants as zlibConstants } from "node:zlib";
import { chromium } from "../../../benchmark/node_modules/playwright/index.mjs";

const root = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"../../.."
);
const buildDir = (environmentName, fallback) =>
	path.resolve(root, process.env[environmentName] ?? fallback);
const leftName = process.env.ANYTHING_LEFT_NAME ?? "left";
const rightName = process.env.ANYTHING_RIGHT_NAME ?? "right";
const variants = [
	{
		name: leftName,
		dir: buildDir(
			"ANYTHING_LEFT_DIST",
			".real-apps/anything-public-default-dist"
		),
		port: 4182,
	},
	{
		name: rightName,
		dir: buildDir(
			"ANYTHING_RIGHT_DIST",
			".real-apps/anything-public-split-dist"
		),
		port: 4183,
	},
];
const trials = Number(process.env.ANYTHING_ROUTE_TRIALS ?? 5);
const latencyMs = Number(process.env.ANYTHING_LATENCY_MS ?? 80);
const downloadMbps = Number(process.env.ANYTHING_DOWNLOAD_MBPS ?? 20);
const uploadMbps = Number(process.env.ANYTHING_UPLOAD_MBPS ?? 2);
const cpuThrottle = Number(process.env.ANYTHING_CPU_RATE ?? 3);
if (
	![latencyMs, downloadMbps, uploadMbps, cpuThrottle, trials].every(
		Number.isFinite
	) ||
	latencyMs < 0 ||
	downloadMbps <= 0 ||
	uploadMbps <= 0 ||
	cpuThrottle < 1 ||
	trials < 1
)
	throw new Error("Invalid network/CPU/trial settings");
const fixedPostRenderWaitMs = 1500;
const servers = [];
const hashFile = async (filename) => {
	const hash = createHash("sha256");
	for await (const buffer of createReadStream(filename)) hash.update(buffer);
	return hash.digest("hex");
};
async function artifactIdentity(directory) {
	const paths = [];
	async function walk(folder) {
		for (const item of await fs.readdir(folder, { withFileTypes: true })) {
			const filename = path.join(folder, item.name);
			if (item.isDirectory()) await walk(filename);
			else if (item.isFile())
				paths.push(
					path.relative(directory, filename).split(path.sep).join("/")
				);
		}
	}
	await walk(directory);
	const tree = createHash("sha256");
	for (const relative of paths.sort())
		tree.update(
			`${relative}\0${await hashFile(path.join(directory, relative))}\n`
		);
	return {
		directory,
		fileCount: paths.length,
		treeSha256: tree.digest("hex"),
		treeHashMethod:
			"sha256(sorted relative path + NUL + sha256(file bytes) + newline)",
		indexHtmlSha256: await hashFile(path.join(directory, "index.html")),
		indexJsSha256: await hashFile(path.join(directory, "index.js")),
	};
}
const artifacts = Object.fromEntries(
	await Promise.all(
		variants.map(async (variant) => [
			variant.name,
			await artifactIdentity(variant.dir),
		])
	)
);
const types = {
	".css": "text/css; charset=utf-8",
	".html": "text/html; charset=utf-8",
	".ico": "image/x-icon",
	".js": "text/javascript; charset=utf-8",
	".json": "application/json; charset=utf-8",
	".png": "image/png",
	".svg": "image/svg+xml",
	".ttf": "font/ttf",
	".woff": "font/woff",
	".woff2": "font/woff2",
};

for (const variant of variants) {
	const rootDir = path.resolve(variant.dir);
	await fs.access(path.join(rootDir, "index.html"));
	const compressed = new Map();
	const server = http.createServer(async (request, response) => {
		try {
			const pathname = decodeURIComponent(
				new URL(request.url ?? "/", "http://localhost").pathname
			);
			let filename = path.resolve(rootDir, `.${pathname}`);
			if (!filename.startsWith(`${rootDir}${path.sep}`) && filename !== rootDir)
				throw new Error("Path escaped build directory");
			try {
				if (!(await fs.stat(filename)).isFile())
					filename = path.join(rootDir, "index.html");
			} catch {
				filename = path.join(rootDir, "index.html");
			}
			const body = await fs.readFile(filename);
			const headers = {
				"cache-control": "no-store",
				"content-type":
					types[path.extname(filename)] ?? "application/octet-stream",
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
			response.writeHead(500).end("local route fixture server error");
		}
	});
	await new Promise((resolve) =>
		server.listen(variant.port, "127.0.0.1", resolve)
	);
	servers.push(server);
}

const browser = await chromium.launch({
	headless: true,
	args: ["--no-sandbox"],
});
const results = [];
const failures = [];
try {
	for (let trial = 0; trial < trials; trial++) {
		const order = trial % 2 === 0 ? variants : [...variants].reverse();
		for (const variant of order) {
			const context = await browser.newContext({
				locale: "fr-FR",
				serviceWorkers: "block",
			});
			const page = await context.newPage();
			const client = await context.newCDPSession(page);
			await client.send("Network.enable");
			await client.send("Network.setCacheDisabled", { cacheDisabled: true });
			await client.send("Network.emulateNetworkConditions", {
				offline: false,
				latency: latencyMs,
				downloadThroughput: (downloadMbps * 1024 * 1024) / 8,
				uploadThroughput: (uploadMbps * 1024 * 1024) / 8,
				connectionType: "cellular4g",
			});
			await client.send("Emulation.setCPUThrottlingRate", {
				rate: cpuThrottle,
			});
			const origin = `http://127.0.0.1:${variant.port}`;
			const errors = [];
			await page.route("**/*", async (route) => {
				const request = route.request();
				const url = new URL(request.url());
				if (url.origin !== origin) return route.abort();
				if (url.pathname.startsWith("/api/")) {
					if (
						request.method() !== "GET" ||
						!["/api/onboarding", "/api/system/logo"].includes(url.pathname)
					) {
						errors.push(`Unmodeled API: ${request.method()} ${url.pathname}`);
						return route.abort();
					}
					return route.fulfill({
						json: {
							onboardingComplete: false,
							success: true,
							results: {},
							logoURL: null,
							isCustomLogo: false,
						},
					});
				}
				return route.continue();
			});
			await page.addInitScript(() => {
				window.__perf = {
					fcp: null,
					fcpH1: null,
					lcp: null,
					longTaskMs: 0,
					h1Timeline: [],
				};
				let previousH1;
				const recordH1 = () => {
					const h1 = document.querySelector("h1")?.textContent?.trim() ?? null;
					if (h1 !== previousH1) {
						previousH1 = h1;
						window.__perf.h1Timeline.push({ at: performance.now(), h1 });
					}
				};
				new MutationObserver(recordH1).observe(document, {
					childList: true,
					characterData: true,
					subtree: true,
				});
				new PerformanceObserver((list) => {
					for (const entry of list.getEntries())
						if (entry.name === "first-contentful-paint") {
							window.__perf.fcp = entry.startTime;
							window.__perf.fcpH1 =
								document.querySelector("h1")?.textContent?.trim() ?? null;
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
			page.on("pageerror", (error) => errors.push(error.message));
			const started = performance.now();
			await page.goto(`${origin}/onboarding`, {
				waitUntil: "domcontentloaded",
				timeout: 30000,
			});
			await page.locator("h1").waitFor({ timeout: 30000 });
			await page.waitForTimeout(fixedPostRenderWaitMs);
			const sample = await page.evaluate(() => ({
				text: document.body.innerText,
				h1: document.querySelector("h1")?.textContent,
				perf: window.__perf,
				resources: performance
					.getEntriesByType("resource")
					.filter((entry) => entry.name.startsWith(location.origin))
					.map((entry) => ({
						path: new URL(entry.name).pathname,
						transferSize: entry.transferSize || 0,
						decodedBodySize: entry.decodedBodySize || 0,
						initiatorType: entry.initiatorType,
						startTime: Math.round(entry.startTime),
						responseEnd: Math.round(entry.responseEnd),
						requestStart: Math.round(entry.requestStart),
					})),
				transferBytes: performance
					.getEntriesByType("resource")
					.filter((entry) => entry.name.startsWith(location.origin))
					.reduce((sum, entry) => sum + (entry.transferSize || 0), 0),
			}));
			const valid =
				sample.h1 === "Bienvenue" &&
				sample.text.includes("Commencer") &&
				errors.length === 0;
			if (!valid)
				failures.push({ variant: variant.name, trial, h1: sample.h1, errors });
			results.push({
				variant: variant.name,
				trial,
				fcpMs: Math.round(sample.perf.fcp ?? 0),
				fcpH1: sample.perf.fcpH1,
				h1Timeline: sample.perf.h1Timeline,
				lcpMs: Math.round(sample.perf.lcp ?? 0),
				longTaskMs: Math.round(sample.perf.longTaskMs),
				transferBytes: sample.transferBytes,
				resources: sample.resources,
				text: sample.text,
				pageErrors: errors,
				elapsedToSampleMs: Math.round(performance.now() - started),
			});
			await context.close();
		}
	}
} finally {
	await browser.close();
	await Promise.all(
		servers.map((server) => new Promise((resolve) => server.close(resolve)))
	);
}

const median = (values) => {
	const sorted = [...values].sort((a, b) => a - b);
	const middle = Math.floor(sorted.length / 2);
	return sorted.length % 2
		? sorted[middle]
		: (sorted[middle - 1] + sorted[middle]) / 2;
};
const summary = Object.fromEntries(
	variants.map(({ name }) => {
		const rows = results.filter((row) => row.variant === name);
		return [
			name,
			Object.fromEntries(
				[
					"fcpMs",
					"lcpMs",
					"longTaskMs",
					"transferBytes",
					"elapsedToSampleMs",
				].map((key) => [key, median(rows.map((row) => row[key]))])
			),
		];
	})
);
const parity = [];
for (let trial = 0; trial < trials; trial++) {
	const native = results.find(
		(row) => row.variant === leftName && row.trial === trial
	);
	const paraglide = results.find(
		(row) => row.variant === rightName && row.trial === trial
	);
	parity.push({
		trial,
		equal: native.text === paraglide.text,
		nativeChars: native.text.length,
		paraglideChars: paraglide.text.length,
	});
}
const report = {
	comparison:
		process.env.ANYTHING_COMPARISON ??
		"same Vite build, app configuration, and route; left and right generated artifacts",
	compilerCommit: process.env.ANYTHING_COMPILER_COMMIT ?? null,
	artifacts,
	source: "2a10d052a1812d7be12c43f9024072cf26a27a8b",
	route: "/onboarding",
	locale: "fr-FR",
	browser: browser.version(),
	network: { latencyMs, downloadMbps, uploadMbps },
	cpuThrottle,
	trials,
	summaryMethod:
		"Conventional median; average of two middle observations for even sample counts",
	fixedPostRenderWaitMs,
	compression: "Brotli Q4 response bodies; no cache",
	results,
	summary,
	parity,
	failures,
};
const reportPath = path.join(
	root,
	process.env.ANYTHING_PUBLIC_REPORT ??
		"benchmark/real-apps/anything-migration/public-route-report.json"
);
await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
console.log(
	JSON.stringify(
		{
			reportPath,
			network: report.network,
			cpuThrottle,
			trials,
			summary,
			failures,
			parity,
		},
		null,
		2
	)
);
if (failures.length || parity.some((row) => !row.equal)) process.exitCode = 1;
