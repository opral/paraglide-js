import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
const origin = process.env.ORIGIN || 'http://127.0.0.1:4251';
const variant = process.env.VARIANT || 'native';
const profileName = process.env.PROFILE || 'desktop';
const routePath = process.env.ROUTE_PATH || '/login';
const profile = profileName === 'mobile'
	? { latencyMs: 150, downloadMbps: 1.6, uploadMbps: 2, cpuRate: 4 }
	: { latencyMs: 80, downloadMbps: 20, uploadMbps: 2, cpuRate: 3 };

const browser = await chromium.launch({ headless: true });
try {
	const context = await browser.newContext({ locale: 'es-ES', viewport: { width: 1280, height: 800 }, serviceWorkers: 'block' });
	await context.addCookies([{ name: 'localai-language', value: 'es', domain: '127.0.0.1', path: '/' }]);
	const page = await context.newPage();
	const errors = [];
	const failures = [];
	const responses = [];
	const pending = [];
	const requests = new Map();
	page.on("request", request => { let resolve; const promise = new Promise(r => resolve = r); requests.set(request, { promise, resolve }); });
	page.on("requestfinished", request => requests.get(request)?.resolve());
	page.on("requestfailed", request => requests.get(request)?.resolve());
	const blockedActions = [];
	page.on('pageerror', error => errors.push(error.message));
	page.on('requestfailed', req => failures.push({ path: new URL(req.url()).pathname, error: req.failure()?.errorText }));
	page.on('response', response => pending.push((async () => {
		const body = await response.body().catch(() => null);
		responses.push({
			path: new URL(response.url()).pathname,
			status: response.status(),
			sha256: body && createHash('sha256').update(body).digest('hex'),
			decodedBytes: body?.length,
		});
	})()));
	await context.route('**/*', route => {
		const req = route.request();
		if (!req.url().startsWith(origin + '/')) return route.abort();
		if (!['GET', 'HEAD'].includes(req.method())) {
			blockedActions.push({ method: req.method(), path: new URL(req.url()).pathname });
			return route.abort();
		}
		return route.continue();
	});
	await page.addInitScript(() => {
		localStorage.setItem('localai-language', 'es');
		window.__localaiLcp = null;
		try {
			new PerformanceObserver(list => {
				for (const entry of list.getEntries()) {
					window.__localaiLcp = { startTime: entry.startTime, size: entry.size, tagName: entry.element?.tagName || null };
				}
			}).observe({ type: 'largest-contentful-paint', buffered: true });
		} catch (_) {}
	});
	const cdp = await context.newCDPSession(page);
	await cdp.send('Network.enable');
	await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
	await cdp.send('Network.emulateNetworkConditions', {
		offline: false,
		latency: profile.latencyMs,
		downloadThroughput: profile.downloadMbps * 1e6 / 8,
		uploadThroughput: profile.uploadMbps * 1e6 / 8,
	});
	await cdp.send('Emulation.setCPUThrottlingRate', { rate: profile.cpuRate });
	await page.goto(origin + routePath, { waitUntil: 'domcontentloaded' });
	await Promise.all([
		page.getByLabel('Correo electrónico', { exact: true }).waitFor({ state: 'visible', timeout: 20000 }),
		page.getByRole('button', { name: 'Continue', exact: true }).waitFor({ state: 'visible', timeout: 20000 }),
	]);
	const sample = await page.evaluate(() => ({
		body: document.body.innerText,
		lang: document.documentElement.lang,
		route: location.pathname,
		firstLoginControlsReadyMs: performance.now(),
		paint: Object.fromEntries(performance.getEntriesByType('paint').map(entry => [entry.name, entry.startTime])),
		largestContentfulPaint: window.__localaiLcp,
		fontsStatusAtReady: document.fonts.status,
		resources: performance.getEntriesByType('resource').map(entry => ({
			path: new URL(entry.name).pathname,
			startMs: entry.startTime,
			endMs: entry.responseEnd,
			encodedBodyBytes: entry.encodedBodySize,
			transferBytes: entry.transferSize,
			protocol: entry.nextHopProtocol,
		})),
		navigation: performance.getEntriesByType('navigation').map(entry => ({
			encodedBodyBytes: entry.encodedBodySize,
			transferBytes: entry.transferSize,
			protocol: entry.nextHopProtocol,
		})),
	}));
	// Capture requests already begun at readiness, including responses still in flight.
	const initialRequests = [...requests.values()];
	let deadline;
	await Promise.race([
		Promise.all(initialRequests.map(request => request.promise)),
		new Promise((_, reject) => { deadline = setTimeout(() => reject(new Error('Initial requests did not finish')), 30000); }),
	]).finally(() => clearTimeout(deadline));
	sample.resources = await page.evaluate(cutoff => performance.getEntriesByType('resource')
		.filter(entry => entry.startTime <= cutoff)
		.map(entry => ({ path: new URL(entry.name).pathname, startMs: entry.startTime, endMs: entry.responseEnd,
			encodedBodyBytes: entry.encodedBodySize, transferBytes: entry.transferSize, protocol: entry.nextHopProtocol })),
		sample.firstLoginControlsReadyMs);
	await Promise.allSettled(pending);
	sample.afterStartupAssets = await page.evaluate(async () => {
		await document.fonts.ready;
		await Promise.all([...document.images].map(image => image.decode().catch(() => {})));
		await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
		return { observedAtMs: performance.now(), largestContentfulPaint: window.__localaiLcp,
			images: [...document.images].map(image => ({src: new URL(image.src).pathname, complete: image.complete, width: image.width, height: image.height})) };
	});
	const localeResponses = responses.filter(response => response.path.startsWith('/locales/'));
	const apiResponses = responses.filter(response => response.path.startsWith('/api/'));
	const report = {
		kind: 'LocalAI locale-specialized namespace app comparison',
		variant,
		routePath,
		profileName,
		profile,
		readinessDefinition: 'First moment Spanish email label and Continue submit control are visible. Readiness sampled before hashing; bytes count all requests started by readiness once completed, including in-flight assets.',
		sample,
		localeResponses,
		apiResponses,
		responses,
		errors,
		failures,
		blockedActions,
	};
	await fs.writeFile(process.env.OUTPUT_FILE, JSON.stringify(report, null, 2) + '\n');
	if (errors.length || failures.length || blockedActions.length || sample.lang !== 'es' || !sample.body.includes('Correo electrónico')) {
		throw new Error('LocalAI login probe failed; inspect raw report');
	}
	if (apiResponses.some(response => response.status !== 200)) throw new Error('Unexpected API response status; inspect raw report');
	if (localeResponses.some(response => response.status !== 200)) throw new Error('Unexpected locale response status; inspect raw report');
	await context.close();
} finally {
	await browser.close();
}
