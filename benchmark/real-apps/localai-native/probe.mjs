import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
const origin = process.env.NATIVE_ORIGIN || 'http://127.0.0.1:4251';
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ locale: 'es-ES', viewport: { width: 1280, height: 800 }, serviceWorkers: 'block' });
  const page = await context.newPage();
  const errors = [];
  const failures = [];
  const responses = [];
  const pending = [];
  const actions = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('requestfailed', req => failures.push({ path: new URL(req.url()).pathname, error: req.failure()?.errorText }));
  page.on('response', response => pending.push((async () => {
    const body = await response.body().catch(() => null);
    responses.push({ path: new URL(response.url()).pathname, status: response.status(), sha256: body && createHash('sha256').update(body).digest('hex'), decodedBytes: body?.length });
  })()));
  await context.route('**/*', route => {
    const req = route.request();
    if (!req.url().startsWith(origin + '/')) return route.abort();
    if (!['GET', 'HEAD'].includes(req.method())) { actions.push({ method: req.method(), path: new URL(req.url()).pathname }); return route.abort(); }
    return route.continue();
  });
  await page.addInitScript(() => localStorage.setItem('localai-language', 'es'));
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 80, downloadThroughput: 20e6 / 8, uploadThroughput: 2e6 / 8 });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 3 });
  await page.goto(origin + '/login', { waitUntil: 'domcontentloaded' });
  await page.getByLabel('Correo electrónico', { exact: true }).waitFor({ state: 'visible', timeout: 20000 });
  await page.waitForFunction(() => document.fonts.status === 'loaded');
  const sample = await page.evaluate(() => ({
    body: document.body.innerText,
    lang: document.documentElement.lang,
    route: location.pathname,
    resources: performance.getEntriesByType('resource').map(entry => ({ path: new URL(entry.name).pathname, startMs: entry.startTime, endMs: entry.responseEnd, encodedBodyBytes: entry.encodedBodySize, transferBytes: entry.transferSize, protocol: entry.nextHopProtocol })),
    navigation: performance.getEntriesByType('navigation').map(entry => ({ encodedBodyBytes: entry.encodedBodySize, transferBytes: entry.transferSize, protocol: entry.nextHopProtocol })),
  }));
  await Promise.allSettled(pending);
  const report = { kind: 'native LocalAI Spanish login feasibility; no candidate timing claim', profile: { latencyMs: 80, downloadMbps: 20, uploadMbps: 2, cpuRate: 3 }, sample, responses, errors, failures, actions };
  await fs.writeFile(process.env.OUTPUT_FILE, JSON.stringify(report, null, 2) + '\n');
  if (errors.length || failures.length || actions.length || sample.lang !== 'es') throw new Error('Native feasibility check failed; inspect raw report');
  await context.close();
} finally { await browser.close(); }
