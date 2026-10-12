import { writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const baselineOrigin = process.env.BASELINE_ORIGIN || 'http://127.0.0.1:4176';
const preloadOrigin = process.env.PRELOAD_ORIGIN || 'http://127.0.0.1:4177';
const profileName = process.env.PROFILE || 'desktop';
const locale = process.env.LOCALE || 'fr-FR';
const outputFile = process.env.OUTPUT_FILE || `./native-preload-${profileName}.json`;
const profile = profileName === 'mobile'
  ? {
      latency: 150,
      download: 1_600_000 / 8,
      upload: 750_000 / 8,
      cpu: 4,
      viewport: { width: 390, height: 844 },
      label: 'mobile 150ms RTT, 1.6Mbps down, 750kbps up, 4x CPU',
    }
  : {
      latency: 80,
      download: (20 * 1024 * 1024) / 8,
      upload: (2 * 1024 * 1024) / 8,
      cpu: 3,
      viewport: { width: 1365, height: 768 },
      label: 'desktop 80ms RTT, 20Mbps down, 2Mbps up, 3x CPU',
    };

if (!process.env.PLAYWRIGHT_MODULE) {
  throw new Error('Set PLAYWRIGHT_MODULE to the pinned Playwright ESM entry point');
}
const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const order = process.env.ORDER === 'preload-first'
  ? [['native-preload', preloadOrigin], ['native', baselineOrigin]]
  : [['native', baselineOrigin], ['native-preload', preloadOrigin]];
const runs = [];

try {
  for (const [variant, origin] of order) {
    const context = await browser.newContext({
      locale,
      viewport: profile.viewport,
      serviceWorkers: 'block',
    });
    await context.addCookies([{ name: 'lang', value: locale, domain: new URL(origin).hostname, path: '/' }]);
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: profile.latency,
      downloadThroughput: profile.download,
      uploadThroughput: profile.upload,
    });
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: profile.cpu });

    const errors = [];
    const api = [];
    let documentEncoding = null;
    page.on('pageerror', (error) => errors.push(`page: ${error.message}`));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(`console: ${message.text()}`);
    });
    page.on('response', (response) => {
      const url = new URL(response.url());
      if (url.origin === origin && url.pathname === '/login') {
        documentEncoding = response.headers()['content-encoding'] || 'identity';
      }
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
        direction: document.documentElement.dir,
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
        nativeLocalePreload: document.querySelector('[data-native-locale-preload]')?.getAttribute('href') ?? null,
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
    runs.push({
      variant,
      origin,
      documentEncoding,
      wallMs: Date.now() - wallStart,
      api,
      fontReadyMs,
      errors,
      ...result,
    });
    await context.close();
  }
} finally {
  await browser.close();
}

const report = {
  sourceCommit: 'e1dfc10449ff713faffacd60273fddcfe2c0a698',
  route: '/login?redirect=false',
  selectedLocale: locale,
  profile: profile.label,
  browserCache: 'disabled per fresh context; service workers blocked',
  server: 'local static fixture, HTTP/1.1, Brotli-Q5 with identity/gzip fallback',
  order,
  runs,
};
await writeFile(outputFile, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
