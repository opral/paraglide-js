import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { brotliCompressSync, constants as zlibConstants } from "node:zlib";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "../..");
const workspacesRoot = path.resolve(repoRoot, "..");
const browserModule = process.env.PLAYWRIGHT_MODULE ?? path.join(
	workspacesRoot,
	"paraglide-real-apps/benchmark/node_modules/playwright/index.mjs",
);
const { chromium } = await import(pathToFileURL(browserModule).href);

const apps = [
	{
		slug: "worldmonitor",
		sha: "968eac6bb03abec85b02f0e014a2c7835f28ee1d",
		root: path.join(repoRoot, ".real-apps/worldmonitor-dist"),
		source: path.join(workspacesRoot, "paraglide-real-apps/.real-apps/worldmonitor-source"),
		locale: "fr",
		route: "/dashboard.html?lang=fr",
		fallback: "dashboard.html",
			detect: "wm query detector (`?lang=fr`)",
		catalogGlob: "src/locales/*.json (excluding en.shell.json)",
		routeLimitation: "External live-data endpoints are blocked; static dashboard and locale chunk render.",
	},
	{
		slug: "open-webui",
		sha: "f8ae8a6c328946dc62cd0712961a0632574581bf",
		root: path.join(repoRoot, ".real-apps/open-webui-source/build"),
		source: path.join(repoRoot, ".real-apps/open-webui-source"),
		locale: "fr-FR",
		route: "/?lang=fr-FR",
		detect: "i18next query-string detector (`lang`); lazy locale chunks",
		catalogGlob: "src/lib/i18n/locales/*/translation.json",
		routeLimitation: "The Python backend is absent; adapter-static fallback remains on its splash shell and never reaches a translated application route.",
	},
	{
		slug: "chatbox",
		sha: "0ac6385ae1ff5bf778777826da3c5edcd55b61b8",
		root: path.join(repoRoot, ".real-apps/chatbox-source/release/app/dist/renderer"),
		source: path.join(repoRoot, ".real-apps/chatbox-source"),
		locale: "fr",
		browserLocale: "fr-FR",
		route: "/",
		detect: "settings hydrate from WebPlatform.getLocale(); all locales statically imported",
		catalogGlob: "src/renderer/i18n/locales/*/translation.json",
		routeLimitation: "Production web renderer target; native desktop APIs are unavailable, but the seeded web UI and French strings render.",
	},
	{
		slug: "paperclip",
		sha: "1b4c803816e82b0265c8422e1a804327a7ed8c54",
		root: path.join(repoRoot, ".real-apps/paperclip-source/ui/dist"),
		source: path.join(repoRoot, ".real-apps/paperclip-source"),
		locale: "en",
		route: "/",
		detect: "synchronous eager glob of all locale JSON; startup locale fixed to en",
		catalogGlob: "ui/src/i18n/locales/*.json",
		routeLimitation: "UI API service is absent; the tested route stays on its Loading… placeholder.",
	},
	{
		slug: "stirling-pdf",
		sha: "313794c573df5e92d2f020f5ec53d08b264d6e4f",
		root: path.join(repoRoot, ".real-apps/stirling-pdf-source/frontend/editor/dist"),
		source: path.join(repoRoot, ".real-apps/stirling-pdf-source/frontend/editor"),
		locale: "fr-FR",
		browserLocale: "fr-FR",
		route: "/",
		detect: "browser language detector + custom TOML HTTP backend; selected locale and English fallback",
		catalogGlob: "public/locales/*/translation.toml",
		routeLimitation: "PDF processor APIs are absent; the file-library shell and locale loading render fully.",
	},
	{
		slug: "lossless-cut",
		sha: "70f2663a7a7c995903701acd2f616d057f4fdc2f",
		root: path.join(repoRoot, ".real-apps/lossless-cut-source/out/renderer"),
		source: path.join(repoRoot, ".real-apps/lossless-cut-source"),
		locale: "en",
		route: "/",
		detect: "Electron main-process locale detector + fs backend; file catalogs not browser assets",
		catalogGlob: "locales/*/translation.json",
		desktopOnly: true,
		routeLimitation: "Electron binary was not installed; only the production renderer build and catalog inventory were available.",
	},
];

const contentTypes = {
	".css": "text/css; charset=utf-8",
	".html": "text/html; charset=utf-8",
	".ico": "image/x-icon",
	".js": "text/javascript; charset=utf-8",
	".json": "application/json; charset=utf-8",
	".mjs": "text/javascript; charset=utf-8",
	".png": "image/png",
	".svg": "image/svg+xml",
	".toml": "text/plain; charset=utf-8",
	".wasm": "application/wasm",
	".webp": "image/webp",
	".woff": "font/woff",
	".woff2": "font/woff2",
};
const compressibleExtensions = new Set([
	".css",
	".html",
	".js",
	".json",
	".mjs",
	".svg",
	".toml",
	".txt",
	".webmanifest",
	".xml",
]);
const brCache = new Map();

async function walk(dir) {
	const entries = await fs.readdir(dir, { withFileTypes: true });
	const files = [];
	for (const entry of entries) {
		const resolved = path.join(dir, entry.name);
		if (entry.isDirectory()) files.push(...(await walk(resolved)));
		else if (entry.isFile()) files.push(resolved);
	}
	return files;
}

async function catalogStats(app) {
	let dir;
	let matches;
	if (app.slug === "worldmonitor") {
		dir = path.join(app.source, "src/locales");
		matches = (await walk(dir)).filter((file) => file.endsWith(".json") && !file.endsWith("en.shell.json"));
	} else if (app.slug === "open-webui") {
		dir = path.join(app.source, "src/lib/i18n/locales");
		matches = (await walk(dir)).filter((file) => /\/translation\.json$/.test(file));
	} else if (app.slug === "chatbox") {
		dir = path.join(app.source, "src/renderer/i18n/locales");
		matches = (await walk(dir)).filter((file) => /\/translation\.json$/.test(file));
	} else if (app.slug === "paperclip") {
		dir = path.join(app.source, "ui/src/i18n/locales");
		matches = (await walk(dir)).filter((file) => file.endsWith(".json"));
	} else if (app.slug === "stirling-pdf") {
		dir = path.join(app.source, "public/locales");
		matches = (await walk(dir)).filter((file) => file.endsWith("/translation.toml"));
	} else {
		dir = path.join(app.source, "locales");
		matches = (await walk(dir)).filter((file) => file.endsWith("/translation.json"));
	}
	let rawBytes = 0;
	let gzipBytes = 0;
	let brotliBytes = 0;
	for (const filename of matches) {
		const bytes = await fs.readFile(filename);
		rawBytes += bytes.byteLength;
		gzipBytes += (await import("node:zlib")).gzipSync(bytes, { level: 9 }).byteLength;
		brotliBytes += brotliCompressSync(bytes, {
			params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 4 },
		}).byteLength;
	}
	return {
		files: matches.length,
		localeCount: matches.length,
		rawBytes,
		gzip9Bytes: gzipBytes,
		brotli4Bytes: brotliBytes,
		glob: app.catalogGlob,
	};
}

function makeServer(root, fallback = "index.html") {
	return http.createServer(async (request, response) => {
		try {
			const pathname = decodeURIComponent(new URL(request.url ?? "/", "http://127.0.0.1").pathname);
			if (pathname.startsWith("/api/") || pathname.startsWith("/ollama/")) {
				response.writeHead(404, { "content-type": "application/json" }).end("{}");
				return;
			}
			let filename = path.resolve(root, `.${pathname}`);
			if (!filename.startsWith(`${root}${path.sep}`) && filename !== root) throw new Error("path escaped root");
			try {
				if (!(await fs.stat(filename)).isFile()) filename = path.join(root, fallback);
			} catch {
				filename = path.join(root, fallback);
			}
			const source = await fs.readFile(filename);
			const headers = {
				"cache-control": "no-store",
				"content-type": contentTypes[path.extname(filename)] ?? "application/octet-stream",
				"x-content-type-options": "nosniff",
			};
			if (
				(request.headers["accept-encoding"] ?? "").includes("br") &&
				compressibleExtensions.has(path.extname(filename)) &&
				source.byteLength > 256
			) {
				headers["content-encoding"] = "br";
				headers.vary = "accept-encoding";
				let encoded = brCache.get(filename);
				if (!encoded) {
					encoded = brotliCompressSync(source, {
						params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 4 },
					});
					brCache.set(filename, encoded);
				}
				headers["content-length"] = encoded.byteLength;
				response.writeHead(200, headers).end(encoded);
			} else {
				headers["content-length"] = source.byteLength;
				response.writeHead(200, headers).end(source);
			}
		} catch (error) {
			response.writeHead(500).end(String(error));
		}
	});
}

const results = [];
const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
const browserVersion = browser.version();
const trialCount = Number(process.env.NATIVE_ROUTE_TRIALS ?? 3);
try {
	for (const app of apps) {
		const stats = await catalogStats(app);
		const routeSamples = [];
		if (!app.desktopOnly) {
			await fs.access(path.join(app.root, app.fallback ?? "index.html"));
			const server = makeServer(app.root, app.fallback ?? "index.html");
			await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
			const origin = `http://127.0.0.1:${server.address().port}`;
			for (let trial = 0; trial < trialCount; trial++) {
				const context = await browser.newContext({
					viewport: { width: 1365, height: 768 },
					locale: app.browserLocale ?? "en-US",
					serviceWorkers: "block",
				});
				const page = await context.newPage();
				const client = await context.newCDPSession(page);
				await client.send("Network.enable");
				await client.send("Network.setCacheDisabled", { cacheDisabled: true });
				await client.send("Network.emulateNetworkConditions", {
					offline: false,
					latency: 80,
					downloadThroughput: (20 * 1024 * 1024) / 8,
					uploadThroughput: (2 * 1024 * 1024) / 8,
					connectionType: "cellular4g",
				});
				await client.send("Emulation.setCPUThrottlingRate", { rate: 3 });
				await page.route("**/*", (route) => {
					if (new URL(route.request().url()).origin !== origin) return route.abort();
					return route.continue();
				});
				const pageErrors = [];
				page.on("pageerror", (error) => pageErrors.push(error.message));
				await page.addInitScript(() => {
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
				const url = `${origin}${app.route}`;
				await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
				await page.waitForTimeout(2500);
				const sample = await page.evaluate(() => ({
					text: document.body?.innerText?.slice(0, 1800) ?? "",
					htmlLang: document.documentElement.lang,
					fcpMs: window.__routePerf.fcp,
					lcpMs: window.__routePerf.lcp,
					longTaskMs: window.__routePerf.longTaskMs,
					requests: [
						...performance.getEntriesByType("navigation").map((entry) => ({
							name: entry.name.replace(location.origin, ""),
							document: true,
							transferBytes: entry.transferSize,
							encodedBytes: entry.encodedBodySize,
							decodedBytes: entry.decodedBodySize,
						})),
						...performance.getEntriesByType("resource").map((entry) => ({
							name: entry.name.replace(location.origin, ""),
							transferBytes: entry.transferSize,
							encodedBytes: entry.encodedBodySize,
							decodedBytes: entry.decodedBodySize,
						})),
					],
				}));
				const sameOrigin = sample.requests.filter((item) => item.name.startsWith("/"));
				routeSamples.push({
					trial,
					route: app.route,
					locale: app.locale,
					htmlLang: sample.htmlLang,
					fcpMs: Math.round(sample.fcpMs ?? 0),
					lcpMs: Math.round(sample.lcpMs ?? 0),
					longTaskMs: Math.round(sample.longTaskMs),
					resourceCount: sameOrigin.length,
					transferBytes: sameOrigin.reduce((n, item) => n + (item.transferBytes || 0), 0),
					encodedBodyBytes: sameOrigin.reduce((n, item) => n + (item.encodedBytes || 0), 0),
					decodedBodyBytes: sameOrigin.reduce((n, item) => n + (item.decodedBytes || 0), 0),
					localeRequests: sameOrigin.filter((item) => /locale|translation|\.toml/i.test(item.name)),
					resources: sameOrigin,
					pageErrors,
					text: sample.text,
				});
				await context.close();
			}
			await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
		}
		results.push({
			slug: app.slug,
			sha: app.sha,
			toolchain: "production client build at pinned SHA; Chromium headless, local static production output",
			loading: app.detect,
			limitations: app.routeLimitation,
			catalogs: stats,
			routeCapture: app.desktopOnly ? { status: "not measured in browser: Electron-only runtime" } : {
				status: "captured",
				backend: "API/third-party traffic blocked or returned local 404; frontend/static catalog assets only",
				throttle: `80 ms RTT, 20 Mbps down, 2 Mbps up, 3x CPU; ${trialCount} cold-cache runs`,
				median: Object.fromEntries(["fcpMs", "lcpMs", "longTaskMs", "transferBytes", "encodedBodyBytes", "decodedBodyBytes", "resourceCount"].map((field) => {
					const values = routeSamples.map((sample) => sample[field]).sort((a, b) => a - b);
					return [field, values[Math.floor(values.length / 2)]];
				})),
				runs: routeSamples,
			},
		});
	}
} finally {
	await browser.close();
}

const reportPath = path.join(scriptDir, "results/native-route-additions.json");
await fs.writeFile(reportPath, `${JSON.stringify({
	date: new Date().toISOString(),
	browser: browserVersion,
	method: "3 fresh browser contexts per web app; no browser cache or service worker; Brotli-Q4 local static server; fixed network/CPU emulation; do not interpret static frontend-only LCP as field Web Vitals",
	apps: results,
}, null, 2)}\n`);
console.log(JSON.stringify(results.map((item) => ({
	slug: item.slug,
	locales: item.catalogs.localeCount,
	catalogBrotli4: item.catalogs.brotli4Bytes,
	median: item.routeCapture.median ?? item.routeCapture.status,
})), null, 2));
