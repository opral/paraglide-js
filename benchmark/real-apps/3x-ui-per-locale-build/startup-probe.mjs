import { writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const playwrightModule = process.env.PLAYWRIGHT_MODULE;
if (!playwrightModule) throw new Error('Set PLAYWRIGHT_MODULE to the installed Playwright entry point');
const { chromium } = await import(pathToFileURL(playwrightModule).href);
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const paraglideName = process.env.PARAGLIDE_NAME ?? 'paraglide';
const versions = [
	{ name: process.env.BASELINE_NAME ?? 'native-es2022', origin: process.env.NATIVE_ORIGIN ?? 'http://127.0.0.1:4173' },
	{ name: paraglideName, origin: process.env.PARAGLIDE_ORIGIN ?? 'http://127.0.0.1:4174' },
];
const profile = process.env.PROBE_PROFILE === "mobile" ? { width: 390, height: 844, rttMs: 150, downMbps: 1.6, upMbps: 0.75, cpuMultiplier: 4 } : { width: 1365, height: 768, rttMs: 80, downMbps: 20, upMbps: 2, cpuMultiplier: 3 };
const samples = [];
try {
	for (const version of versions) {
		const context = await browser.newContext({
			viewport: { width: profile.width, height: profile.height },
			locale: 'en-US',
			serviceWorkers: 'block',
		});
		await context.addCookies([{ name: 'lang', value: 'es-ES', domain: '127.0.0.1', path: '/' }]);
		const page = await context.newPage();
		const client = await context.newCDPSession(page);
		await client.send('Network.enable');
		await client.send('Network.setCacheDisabled', { cacheDisabled: true });
		await client.send('Network.emulateNetworkConditions', {
			offline: false,
			latency: profile.rttMs,
			downloadThroughput: (profile.downMbps * 1024 * 1024) / 8,
			uploadThroughput: (profile.upMbps * 1024 * 1024) / 8,
			connectionType: 'cellular4g',
		});
		await client.send('Emulation.setCPUThrottlingRate', { rate: profile.cpuMultiplier });
		await page.route('**/*', (route) => new URL(route.request().url()).origin === version.origin ? route.continue() : route.abort());
		const errors = [];
		const responseHashes = [];
		const responseTasks = [];
		page.on('pageerror', (error) => errors.push(`page: ${error.message}`));
		page.on('console', (message) => { if (message.type() === 'error') errors.push(`console: ${message.text()}`); });
		page.on('response', (response) => {
			const url = new URL(response.url());
			if (url.origin !== version.origin) return;
			responseTasks.push((async () => {
				const headers = await response.allHeaders();
				const body = await response.body();
				responseHashes.push({
					path: url.pathname,
					status: response.status(),
					contentEncoding: headers['content-encoding'] ?? null,
					contentLength: headers['content-length'] ?? null,
					decodedBodySha256: createHash('sha256').update(body).digest('hex'),
				});
			})());
		});
		await page.addInitScript(() => {
			window.__i18nStartup = { fcp: null, lcp: null, fontReady: null };
			new PerformanceObserver((list) => {
				for (const entry of list.getEntries()) if (entry.name === 'first-contentful-paint') window.__i18nStartup.fcp = entry.startTime;
			}).observe({ type: 'paint', buffered: true });
			new PerformanceObserver((list) => {
				for (const entry of list.getEntries()) window.__i18nStartup.lcp = entry.startTime;
			}).observe({ type: 'largest-contentful-paint', buffered: true });
			document.fonts.ready.then(() => { window.__i18nStartup.fontReady = performance.now(); });
		});
		const started = Date.now();
		await page.goto(`${version.origin}/login`, { waitUntil: 'domcontentloaded', timeout: 30000 });
		await page.waitForFunction(() => document.body?.innerText?.includes('Hola'), { timeout: 15000 });
		const translatedReadyMs = await page.evaluate(() => Math.round(performance.now()));
		await Promise.all(responseTasks);
		const sample = await page.evaluate(() => {
			const resources = performance.getEntriesByType('resource').map((entry) => ({
				path: entry.name.replace(location.origin, ''),
				startMs: Math.round(entry.startTime),
				endMs: Math.round(entry.responseEnd),
				transferBytes: entry.transferSize,
				encodedBytes: entry.encodedBodySize,
				decodedBytes: entry.decodedBodySize,
			}));
			const navigation = performance.getEntriesByType('navigation')[0];
			return {
				text: document.body.innerText,
				username: document.querySelector('input[placeholder="Nombre de Usuario"]')?.getAttribute('placeholder'),
				password: document.querySelector('input[placeholder="Contraseña"]')?.getAttribute('placeholder'),
				fcpMs: Math.round(window.__i18nStartup.fcp ?? 0),
				lcpMs: Math.round(window.__i18nStartup.lcp ?? 0),
				fontReadyMs: Math.round(window.__i18nStartup.fontReady ?? 0),

				nextHopProtocol: navigation?.nextHopProtocol,
				domInteractiveMs: Math.round(navigation?.domInteractive ?? 0),
				resources,
			};
		});
		samples.push({
			variant: version.name,
			throttle: profile,
			wallMs: Date.now() - started,
			...sample,
			translatedReadyMs,
			responseHashes,
			localeResources: sample.resources.filter((resource) => /es-ES|en-US|translation/i.test(resource.path)),
			errors,
		});
		await context.close();
	}
} finally {
	await browser.close();
}
const result = {
	route: '/login',
	localeCookie: 'lang=es-ES',
	protocol: 'HTTP/1.1 loopback; server Brotli-Q4 for compressible assets; no TLS/HTTP2',
	profile,
	methodology: 'One cold run per variant; fresh browser context and cache disabled; profile field specifies viewport, RTT, throughput and CPU throttling. Readiness is sampled immediately after the visible Spanish greeting condition, before collecting response hashes. All same-origin responses are SHA-256 hashed after browser decompression.',
	samples,
};
const output = process.env.OUTPUT_FILE ?? new URL('./core-chunk-startup-probe.json', import.meta.url);
await writeFile(output, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result, null, 2));
