import { writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const origin = process.env.ORIGIN || 'http://127.0.0.1:4176';
const outputFile = process.env.OUTPUT_FILE || './native-route.json';
const locale = process.env.LOCALE || 'fr-FR';
let chromium;
if (process.env.PLAYWRIGHT_MODULE) {
  const moduleUrl = pathToFileURL(resolve(process.env.PLAYWRIGHT_MODULE));
  ({ chromium } = await import(moduleUrl.href));
} else {
  const require = createRequire(resolve(process.env.PLAYWRIGHT_RESOLVE_FROM || `${process.cwd()}/package.json`));
  ({ chromium } = require('playwright'));
}

const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
try {
  const context = await browser.newContext({ locale, serviceWorkers: 'block' });
  await context.addCookies([{ name: 'lang', value: locale, domain: new URL(origin).hostname, path: '/' }]);
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 80,
    downloadThroughput: (20 * 1024 * 1024) / 8,
    uploadThroughput: (2 * 1024 * 1024) / 8,
    connectionType: 'cellular4g',
  });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 3 });

  const errors = [];
  const api = [];
  page.on('pageerror', (error) => errors.push(`page: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
  page.on('response', (response) => {
    const url = new URL(response.url());
    if (url.origin === origin && url.pathname.startsWith('/api/')) {
      api.push({ path: url.pathname, status: response.status() });
    }
  });

  await page.addInitScript(() => {
    window.__probe = { translatedReadyMs: null, fcpMs: null, lcpMs: null };
    const record = () => {
      if (
        window.__probe.translatedReadyMs == null &&
        document.body?.innerText.includes('Content de te revoir')
      ) {
        window.__probe.translatedReadyMs = performance.now();
      }
    };
    new MutationObserver(record).observe(document, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    document.addEventListener('DOMContentLoaded', record, { once: true });
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.name === 'first-contentful-paint') window.__probe.fcpMs = entry.startTime;
      }
    }).observe({ type: 'paint', buffered: true });
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) window.__probe.lcpMs = entry.startTime;
    }).observe({ type: 'largest-contentful-paint', buffered: true });
  });

  const wallStart = Date.now();
  await page.goto(`${origin}/login?redirect=false`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.getByText('Content de te revoir', { exact: true }).waitFor({ state: 'visible', timeout: 30000 });
  await page.getByText('Adresse courriel', { exact: true }).waitFor({ state: 'visible', timeout: 10000 });
  await page.getByText('Mot de passe', { exact: true }).waitFor({ state: 'visible', timeout: 10000 });
  const fontReadyMs = await page.evaluate(async () => {
    await document.fonts.ready;
    return Math.round(performance.now());
  });
  const result = await page.evaluate(() => {
    const resources = performance.getEntriesByType('resource').map((entry) => ({
      path: entry.name.replace(location.origin, ''),
      startMs: Math.round(entry.startTime),
      endMs: Math.round(entry.responseEnd),
      transferBytesIncludingHeaders: entry.transferSize,
      encodedBodyBytes: entry.encodedBodySize,
      decodedBodyBytes: entry.decodedBodySize,
    }));
    const navigation = performance.getEntriesByType('navigation')[0];
    return {
      visibleText: document.body.innerText,
      locale: document.documentElement.lang,
      placeholders: [...document.querySelectorAll('input')].map((input) => ({
        type: input.type,
        placeholder: input.getAttribute('placeholder'),
        ariaLabel: input.getAttribute('aria-label'),
      })),
      translatedReadyMs: Math.round(window.__probe.translatedReadyMs ?? 0),
      fcpMs: Math.round(window.__probe.fcpMs ?? 0),
      lcpMs: Math.round(window.__probe.lcpMs ?? 0),
      fontStatusAfterReady: document.fonts.status,
      interFontLoaded: document.fonts.check('400 16px Inter'),
      navigation: navigation && {
        transferBytesIncludingHeaders: navigation.transferSize,
        encodedBodyBytes: navigation.encodedBodySize,
        decodedBodyBytes: navigation.decodedBodySize,
        domInteractiveMs: Math.round(navigation.domInteractive),
        responseEndMs: Math.round(navigation.responseEnd),
        nextHopProtocol: navigation.nextHopProtocol,
      },
      resources,
      resourceTransferBytesIncludingHeaders: resources.reduce(
        (sum, row) => sum + row.transferBytesIncludingHeaders,
        0,
      ),
      resourceEncodedBodyBytes: resources.reduce((sum, row) => sum + row.encodedBodyBytes, 0),
    };
  });

  const report = {
    appCommit: process.env.SOURCE_COMMIT || 'e1dfc10449ff713faffacd60273fddcfe2c0a698',
    route: '/login?redirect=false',
    selectedLocale: `${locale} normalized to ${result.locale}`,
    method:
      'one cold native route run, browser cache disabled, 80ms RTT, 20Mbps down, 2Mbps up, 3x CPU, Brotli-Q5 static server, read-only config/refresh API fixtures',
    wallMs: Date.now() - wallStart,
    api,
    ...result,
    fontReadyMs,
    errors,
  };
  await writeFile(outputFile, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
  await context.close();
} finally {
  await browser.close();
}
