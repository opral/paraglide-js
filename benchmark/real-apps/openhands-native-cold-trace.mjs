#!/usr/bin/env node
// One-shot native OpenHands browser trace. This does not rebuild or modify the app.
// Environment: OPENHANDS_SOURCE, OUTPUT_JSON, PROFILE_LATENCY_MS,
// PROFILE_DOWNLOAD_MBPS, PROFILE_CPU_RATE.
import { createServer } from 'node:http';
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const here = path.dirname(fileURLToPath(import.meta.url));
const source = path.resolve(process.env.OPENHANDS_SOURCE ?? '/root/repos-iii/openhands-locale-audit');
const build = path.join(source, 'build');
const output = path.resolve(process.env.OUTPUT_JSON ?? path.join(here, 'results/openhands-native-cold-fr.json'));
const profile = {
  cdpLatencyMs: Number(process.env.PROFILE_LATENCY_MS ?? 80),
  downloadMbps: Number(process.env.PROFILE_DOWNLOAD_MBPS ?? 20),
  uploadMbps: Number(process.env.PROFILE_DOWNLOAD_MBPS ?? 20),
  cpuThrottlingRate: Number(process.env.PROFILE_CPU_RATE ?? 3),
};
const readinessTimeoutMs = Number(process.env.READINESS_TIMEOUT_MS ?? 90_000);
const postReadyObservationMs = Number(process.env.POST_READY_OBSERVATION_MS ?? 1500);
const locale = 'fr';
const readyText = 'Sur quoi voulez-vous travailler ?';
const startedAt = process.hrtime.bigint();
const elapsedMs = () => Number(process.hrtime.bigint() - startedAt) / 1e6;
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const mime = (file) => ({
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8', '.wasm': 'application/wasm',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
})[path.extname(file).toLowerCase()] ?? 'application/octet-stream';
const compressible = (type) => /^(text\/|application\/(javascript|json|manifest\+json|xml|wasm))|image\/svg\+xml/.test(type);

if (!existsSync(path.join(build, 'index.html'))) {
  throw new Error(`Expected existing mock build at ${build}; run the pinned build separately first.`);
}

function treeManifest(root) {
  const rows = [];
  // Keep this deterministic and dependency-free; recurse using readdirSync.
  const { readdirSync } = awaitImportFs;
  function visit(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) visit(full);
      else if (entry.isFile()) {
        const data = readFileSync(full);
        rows.push({ path: path.relative(root, full).split(path.sep).join('/'), bytes: data.length, sha256: hash(data) });
      }
    }
  }
  visit(root);
  const canonical = rows.map((r) => `${r.path}\0${r.bytes}\0${r.sha256}\n`).join('');
  return { files: rows.length, bytes: rows.reduce((sum, r) => sum + r.bytes, 0), sha256: hash(canonical), rows };
}

const awaitImportFs = await import('node:fs');
const buildManifest = treeManifest(build);
const keyFiles = ['index.html', ...buildManifest.rows.map((r) => r.path).filter((p) => /(?:entry\.client|utils-|root-|home-|index-home|manifest-|openhands\.json|serviceWorker)/.test(p))];
const selectedFiles = [...new Set(keyFiles)].map((rel) => {
  const data = readFileSync(path.join(build, rel));
  return { path: rel, bytes: data.length, sha256: hash(data) };
});
const packageJson = JSON.parse(readFileSync(path.join(source, 'package.json'), 'utf8'));
const auditFilePaths = [
  'package.json', 'vite.config.ts', 'react-router.config.ts',
  'src/entry.client.tsx', 'src/i18n/index.ts', 'src/i18n/translation.json',
  'src/i18n/declaration.ts', 'src/routes/root-layout.tsx', 'src/routes/home.tsx',
  'src/components/features/home/home-header/home-header-title.tsx',
  'src/api/mars/mars-web-bridge.ts', 'src/mocks/should-start-mock-worker.ts',
  'src/mocks/settings-handlers.ts', 'src/mocks/handlers.ts',
  'src/api/settings-service/settings-service.api.ts',
  'scripts/make-i18n-translations.cjs',
];
const sourceAuditFiles = auditFilePaths.map((rel) => {
  const data = readFileSync(path.join(source, rel));
  return { path: rel, bytes: data.length, sha256: hash(data) };
});
const translationDefinitions = JSON.parse(readFileSync(path.join(source, 'src/i18n/translation.json'), 'utf8'));
const translationLocales = [...new Set(Object.values(translationDefinitions).flatMap((values) => Object.keys(values)))].sort();
const declarationSource = readFileSync(path.join(source, 'src/i18n/declaration.ts'), 'utf8');
const versions = {};
for (const name of ['vite', 'react-router', 'i18next', 'i18next-http-backend', 'i18next-browser-languagedetector', 'playwright', '@playwright/test']) {
  try { versions[name] = JSON.parse(readFileSync(path.join(source, 'node_modules', name, 'package.json'), 'utf8')).version; } catch {}
}
let sourceCommit = null;
try { sourceCommit = execFileSync('git', ['-C', source, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(); } catch {}
let sourceStatus = null;
try { sourceStatus = execFileSync('git', ['-C', source, 'status', '--short'], { encoding: 'utf8' }).trim(); } catch {}

const serverLog = [];
const staticRoot = path.resolve(build);
const server = createServer((req, res) => {
  const requestStartMs = elapsedMs();
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname); }
  catch { res.writeHead(400).end(); return; }
  let file = path.resolve(staticRoot, `.${pathname}`);
  if (file !== staticRoot && !file.startsWith(`${staticRoot}${path.sep}`)) {
    res.writeHead(403).end(); return;
  }
  if (!existsSync(file) || !statSync(file).isFile()) file = path.join(staticRoot, 'index.html');
  const raw = readFileSync(file);
  const contentType = mime(file);
  const useGzip = compressible(contentType) && /(?:^|,)\s*gzip\b/i.test(req.headers['accept-encoding'] ?? '');
  const body = useGzip ? gzipSync(raw, { level: 6, mtime: 0 }) : raw;
  const row = {
    order: serverLog.length + 1,
    method: req.method,
    path: pathname,
    servedPath: path.relative(staticRoot, file).split(path.sep).join('/'),
    fallbackToSpa: path.relative(staticRoot, file).split(path.sep).join('/') === 'index.html' && pathname !== '/',
    requestStartMs: Number(requestStartMs.toFixed(2)),
    status: 200,
    contentType,
    contentEncoding: useGzip ? 'gzip' : 'identity',
    originalBytes: raw.length,
    encodedBytes: body.length,
    responseEndMs: null,
  };
  serverLog.push(row);
  res.writeHead(200, {
    'Content-Type': contentType,
    'Content-Length': String(body.length),
    'Cache-Control': 'no-store',
    'Vary': 'Accept-Encoding',
    ...(useGzip ? { 'Content-Encoding': 'gzip' } : {}),
  });
  res.end(body, () => { row.responseEndMs = Number(elapsedMs().toFixed(2)); });
});

const requireFromSource = createRequire(path.join(source, 'package.json'));
const { chromium } = requireFromSource('playwright');
const browser = await chromium.launch({ headless: true });
let context;
let page;
const browserLog = { requests: [], responses: [], failed: [], pageErrors: [], consoleErrors: [] };
  let browserStartEpoch = null;
  let readyObservedAt = null;
  let gotoDomContentLoadedObservedMs = null;
try {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const origin = `http://127.0.0.1:${address.port}`;
  context = await browser.newContext({
    locale: 'fr-FR',
    viewport: { width: 1365, height: 900 },
    serviceWorkers: 'allow',
  });
  await context.addInitScript(() => {
    localStorage.setItem('i18nextLng', 'fr');
    localStorage.setItem('context.locale', 'fr');
    localStorage.setItem('openhands-backends', JSON.stringify([
      { id: 'probe-local', name: 'Mock local', host: 'http://127.0.0.1:8000', apiKey: 'mock-key', kind: 'local' },
    ]));
    localStorage.setItem('openhands-active-backend', JSON.stringify({ backendId: 'probe-local', orgId: null }));
    localStorage.setItem('openhands-onboarded', '1');
  });
  page = await context.newPage();
  page.on('pageerror', (error) => browserLog.pageErrors.push({ atMs: Number((elapsedMs() - browserStartEpoch).toFixed(2)), message: error.message }));
  page.on('console', (message) => { if (message.type() === 'error') browserLog.consoleErrors.push({ atMs: Number((elapsedMs() - browserStartEpoch).toFixed(2)), text: message.text() }); });
  page.on('request', (request) => browserLog.requests.push({
    atMs: Number((elapsedMs() - browserStartEpoch).toFixed(2)),
    method: request.method(), url: request.url(), resourceType: request.resourceType(),
  }));
  page.on('response', async (response) => {
    const request = response.request();
    const headers = await response.allHeaders().catch(() => ({}));
    browserLog.responses.push({
      atMs: Number((elapsedMs() - browserStartEpoch).toFixed(2)),
      url: response.url(), status: response.status(), resourceType: request.resourceType(),
      contentEncoding: headers['content-encoding'] ?? null,
      contentLength: headers['content-length'] ?? null,
    });
  });
  page.on('requestfailed', (request) => browserLog.failed.push({
    atMs: Number((elapsedMs() - browserStartEpoch).toFixed(2)), url: request.url(),
    resourceType: request.resourceType(), error: request.failure()?.errorText ?? null,
  }));

  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: profile.cdpLatencyMs,
    downloadThroughput: profile.downloadMbps * 1024 * 1024 / 8,
    uploadThroughput: profile.uploadMbps * 1024 * 1024 / 8,
    connectionType: 'wifi',
  });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: profile.cpuThrottlingRate });
  await page.addInitScript((marker) => {
    const check = () => {
      const home = document.querySelector('[data-testid="home-screen"]');
      if (home && document.documentElement.lang.toLowerCase().startsWith('fr') && home.innerText.includes(marker)) {
        if (!performance.getEntriesByName('openhands-translated-home-ready').length) {
          performance.mark('openhands-translated-home-ready');
        }
      }
    };
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        if (record.type === 'attributes' && (record.attributeName === 'lang' || record.attributeName === 'dir')) {
          (window.__openhandsLocaleTimeline ??= []).push({ atMs: performance.now(), lang: document.documentElement.lang, dir: document.documentElement.dir });
        }
      }
      check();
    });
    const begin = () => {
      window.__openhandsLocaleTimeline = [{ atMs: performance.now(), lang: document.documentElement.lang, dir: document.documentElement.dir }];
      observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['lang', 'dir'] });
      check();
    };
    if (document.documentElement) begin(); else document.addEventListener('DOMContentLoaded', begin, { once: true });
  }, readyText);

  browserStartEpoch = elapsedMs();
  await page.goto(origin, { waitUntil: 'domcontentloaded', timeout: 90_000 });
  gotoDomContentLoadedObservedMs = Number((elapsedMs() - browserStartEpoch).toFixed(2));
  let readyTimeout = null;
  try {
    await page.waitForFunction((marker) => {
      const home = document.querySelector('[data-testid="home-screen"]');
      return Boolean(home && document.documentElement.lang.toLowerCase().startsWith('fr') && home.innerText.includes(marker));
    }, readyText, { timeout: readinessTimeoutMs });
  } catch (error) {
    readyTimeout = error.message;
  }
  readyObservedAt = Number((elapsedMs() - browserStartEpoch).toFixed(2));
  if (!readyTimeout) await page.waitForTimeout(postReadyObservationMs);

  const browserState = await page.evaluate(() => ({
    title: document.title,
    htmlLang: document.documentElement.lang,
    htmlDir: document.documentElement.dir,
    localeTimeline: window.__openhandsLocaleTimeline ?? [],
    readyMark: performance.getEntriesByName('openhands-translated-home-ready').at(-1)?.startTime ?? null,
    navigation: performance.getEntriesByType('navigation').map((e) => ({
      type: e.type, domContentLoadedEventEnd: e.domContentLoadedEventEnd,
      loadEventEnd: e.loadEventEnd, transferSize: e.transferSize,
    })),
    resources: performance.getEntriesByType('resource').map((e) => ({
      name: e.name, initiatorType: e.initiatorType, startTime: e.startTime,
      duration: e.duration, transferSize: e.transferSize,
      encodedBodySize: e.encodedBodySize, decodedBodySize: e.decodedBodySize,
    })),
    visibleText: document.body.innerText,
    storage: {
      i18nextLng: localStorage.getItem('i18nextLng'),
      locale: localStorage.getItem('context.locale'),
      onboarded: localStorage.getItem('openhands-onboarded'),
    },
  }));

  const profileNote = 'CDP Network.emulateNetworkConditions latency is a per-request browser throttle; requested target was 80 ms RTT, but this setting is an 80 ms CDP latency value and is not a calibrated network RTT.';
  const result = {
    schemaVersion: 1,
    purpose: 'single cold native French route trace; feasibility baseline only, not a comparative performance claim',
    capturedAt: new Date().toISOString(),
    source: { path: source, commit: sourceCommit, dirtyStatus: sourceStatus, buildCommand: 'npm run build:mock', mockBuildEnv: 'VITE_MOCK_API=true', appPackage: packageJson.name, appVersion: packageJson.version, nodeAtCapture: process.version, runtimeVersions: versions, auditFiles: sourceAuditFiles, catalogShape: { translationDefinitionCount: Object.keys(translationDefinitions).length, locales: translationLocales, enumCount: (declarationSource.match(/^  [A-Z0-9_$]+ = /gm) ?? []).length } },
    responseFixtureAudit: {
      mswEnabled: true,
      settingsEndpoint: 'GET /api/settings is intercepted by src/mocks/settings-handlers.ts. In the unmodified mock fixture, misc_settings.app_preferences.language defaults to null; src/api/settings-service/settings-service.api.ts hoists that null onto settings.language, and src/routes/root-layout.tsx changes language only for a truthy settings.language.',
      initialResponseFixtureLanguage: null,
      observedLanguage: 'document.lang transitions from the static shell en to fr after i18next initializes; it stays fr during the 1500 ms post-ready observation window. No third locale catalog request occurred.',
      unhandledMockRequests: 'The existing MSW setup does not handle /api/meta-profiles or /api/automation/sdk-version; these fail against 127.0.0.1:8000 and are kept in browserNetwork.failed.',
    },
    artifact: { buildPath: build, manifest: { files: buildManifest.files, bytes: buildManifest.bytes, sha256: buildManifest.sha256 }, selectedFiles },
    browser: { name: 'Chromium via Playwright', version: browser.version(), profile, profileNote, cacheDisabled: true, freshBrowserContext: true, locale: 'fr-FR', localStorageSeed: {
      'i18nextLng': 'fr', 'context.locale': 'fr',
      'openhands-backends': [{ id: 'probe-local', name: 'Mock local', host: 'http://127.0.0.1:8000', apiKey: 'mock-key', kind: 'local' }],
      'openhands-active-backend': { backendId: 'probe-local', orgId: null }, 'openhands-onboarded': '1',
    } },
    appState: browserState,
    readinessError: readyTimeout,
    timings: { gotoDomContentLoadedObservedMs, translatedHomeReadyObservedMs: readyTimeout ? null : readyObservedAt, postReadyObservationMs },
    server: { compression: 'gzip level 6 for text-like MIME types when browser advertises gzip; Content-Length is encoded response bytes; otherwise identity', requests: serverLog },
    browserNetwork: browserLog,
    caveats: [
      'One run only; this is a critical-path observation, not a performance distribution or a Paraglide comparison.',
      'The profile uses CDP latency=80 ms, which is not a calibrated 80 ms round-trip network.',
      'The local static server uses HTTP/1 and explicit gzip, not production CDN TLS/HTTP2/HTTP3 behavior.',
      'The mock build uses the app’s existing MSW fixture. Unhandled backend API failures are recorded; no app API behavior was changed.',
    ],
  };
  const firstCatalogIndex = serverLog.findIndex((row) => row.path.startsWith('/locales/'));
  const rootServerRequest = serverLog.find((row) => row.path === '/');
  const readyServerCutoff = browserState.readyMark == null || !rootServerRequest
    ? null
    : rootServerRequest.requestStartMs + browserState.readyMark;
  const rowsByReady = readyServerCutoff == null ? [] : serverLog.filter((row) => row.requestStartMs <= readyServerCutoff);
  const requestPath = (url) => { try { return new URL(url).pathname; } catch { return url; } };
  const requestForPath = (resourcePath) => browserLog.requests.find((row) => requestPath(row.url) === resourcePath);
  const responseForPath = (resourcePath) => browserLog.responses.find((row) => requestPath(row.url) === resourcePath);
  result.summary = {
    readiness: {
      marker: `home-screen visible with French text: ${readyText}, and document.documentElement.lang starts with fr`,
      performanceMarkMs: browserState.readyMark,
      playwrightObservedMs: readyTimeout ? null : readyObservedAt,
      domContentLoadedObservedMs: gotoDomContentLoadedObservedMs,
      postReadyObservationMs,
      localeTimeline: browserState.localeTimeline,
    },
    transfer: {
      meaning: 'Static server response entity bytes from Content-Length, gzip level 6; not TLS/header wire bytes. Synthetic MSW API response sizes are excluded.',
      serverStaticRequests: serverLog.length,
      serverStaticGzipBytes: serverLog.filter((row) => row.contentEncoding === 'gzip').reduce((sum, row) => sum + row.encodedBytes, 0),
      identityResponses: serverLog.filter((row) => row.contentEncoding === 'identity').length,
      requestsBeforeFirstCatalog: firstCatalogIndex,
      encodedBytesBeforeFirstCatalog: serverLog.slice(0, firstCatalogIndex).reduce((sum, row) => sum + row.encodedBytes, 0),
      approximateServerRequestsByReady: rowsByReady.length,
      approximateServerEncodedBytesByReady: rowsByReady.reduce((sum, row) => sum + row.encodedBytes, 0),
      catalogs: serverLog.filter((row) => row.path.startsWith('/locales/')).map((row) => ({ path: row.path, originalBytes: row.originalBytes, gzipBytes: row.encodedBytes, serverStartMs: row.requestStartMs, serverEndMs: row.responseEndMs, browserRequestAtMs: requestForPath(row.path)?.atMs ?? null, browserResponseAtMs: responseForPath(row.path)?.atMs ?? null })),
      bridge: serverLog.filter((row) => row.path === '/mars/health').map((row) => ({ path: row.path, servedPath: row.servedPath, spaFallback: row.fallbackToSpa, gzipBytes: row.encodedBytes, serverStartMs: row.requestStartMs, serverEndMs: row.responseEndMs, browserRequestAtMs: requestForPath(row.path)?.atMs ?? null, browserResponseAtMs: responseForPath(row.path)?.atMs ?? null })),
    },
    browser: { requests: browserLog.requests.length, responses: browserLog.responses.length, failed: browserLog.failed, pageErrors: browserLog.pageErrors, consoleErrors: browserLog.consoleErrors },
  };
  const { mkdirSync, writeFileSync } = await import('node:fs');
  mkdirSync(path.dirname(output), { recursive: true });
  writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({ output, serverRequests: serverLog.length, readinessError: readyTimeout, translatedHomeReadyObservedMs: readyTimeout ? null : readyObservedAt, title: browserState.title, htmlLang: browserState.htmlLang, pageErrors: browserLog.pageErrors.length, compressedBytes: serverLog.reduce((n, r) => n + r.encodedBytes, 0) }, null, 2)}\n`);
} finally {
  await context?.close();
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
