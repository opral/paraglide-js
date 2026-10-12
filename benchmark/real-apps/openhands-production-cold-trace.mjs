#!/usr/bin/env node
// Production Vite artifact trace with MSW responses captured once and replayed
// outside the bundle through Playwright routing. Does not rebuild the app.
import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const here = path.dirname(fileURLToPath(import.meta.url));
const source = path.resolve(process.env.OPENHANDS_SOURCE ?? '/root/repos-iii/openhands-locale-audit');
const build = path.resolve(process.env.OPENHANDS_BUILD_DIR ?? path.join(source, 'build'));
const mode = process.env.TRACE_MODE ?? 'capture';
const fixturesFile = path.resolve(process.env.FIXTURE_JSON ?? path.join(here, 'results/openhands-msw-api-fixtures.json'));
const output = path.resolve(process.env.OUTPUT_JSON ?? path.join(here, 'results/openhands-production-native-cold-fr.json'));
const profile = {
  cdpLatencyMs: Number(process.env.PROFILE_LATENCY_MS ?? 80),
  downloadMbps: Number(process.env.PROFILE_DOWNLOAD_MBPS ?? 20),
  uploadMbps: Number(process.env.PROFILE_UPLOAD_MBPS ?? 20),
  cpuThrottlingRate: Number(process.env.PROFILE_CPU_RATE ?? 3),
};
const readyTimeoutMs = Number(process.env.READINESS_TIMEOUT_MS ?? 90_000);
const postReadyObservationMs = Number(process.env.POST_READY_OBSERVATION_MS ?? 1500);
const readyText = 'Sur quoi voulez-vous travailler ?';
const sourceStart = process.hrtime.bigint();
const elapsedMs = () => Number(process.hrtime.bigint() - sourceStart) / 1e6;
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
const isCompressible = (type) => /^(text\/|application\/(javascript|json|manifest\+json|xml|wasm))|image\/svg\+xml/.test(type);
const auditPaths = [
  'package.json', 'vite.config.ts', 'react-router.config.ts', 'src/entry.client.tsx',
  'src/i18n/index.ts', 'src/i18n/translation.json', 'src/i18n/declaration.ts',
  'src/routes/root-layout.tsx', 'src/routes/home.tsx',
  'src/components/features/home/home-header/home-header-title.tsx',
  'src/api/mars/mars-web-bridge.ts', 'src/mocks/should-start-mock-worker.ts',
  'src/mocks/settings-handlers.ts', 'src/mocks/handlers.ts',
  'src/api/settings-service/settings-service.api.ts', 'scripts/make-i18n-translations.cjs',
];

if (!['capture', 'replay'].includes(mode)) throw new Error('TRACE_MODE must be capture or replay');
if (!existsSync(path.join(build, 'index.html'))) throw new Error(`Missing build/index.html: ${build}`);
const requireFromSource = createRequire(path.join(source, 'package.json'));
const { chromium } = requireFromSource('playwright');
const readPackageVersion = (name) => {
  try { return JSON.parse(readFileSync(path.join(source, 'node_modules', name, 'package.json'), 'utf8')).version; } catch { return null; }
};
const packageJson = JSON.parse(readFileSync(path.join(source, 'package.json'), 'utf8'));
const sourceFiles = auditPaths.map((rel) => {
  const bytes = readFileSync(path.join(source, rel));
  return { path: rel, bytes: bytes.length, sha256: hash(bytes) };
});
const translations = JSON.parse(readFileSync(path.join(source, 'src/i18n/translation.json'), 'utf8'));
const locales = [...new Set(Object.values(translations).flatMap((v) => Object.keys(v)))].sort();
let sourceCommit = null;
let sourceStatus = null;
try { sourceCommit = execFileSync('git', ['-C', source, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(); } catch {}
try { sourceStatus = execFileSync('git', ['-C', source, 'status', '--short'], { encoding: 'utf8' }).trim(); } catch {}

const buildFiles = [];
const { readdirSync, mkdirSync, writeFileSync } = await import('node:fs');
function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.isFile()) {
      const bytes = readFileSync(full);
      buildFiles.push({ path: path.relative(build, full).split(path.sep).join('/'), bytes: bytes.length, sha256: hash(bytes) });
    }
  }
}
walk(build);
const buildManifest = {
  files: buildFiles.length,
  bytes: buildFiles.reduce((sum, row) => sum + row.bytes, 0),
  sha256: hash(buildFiles.map((row) => `${row.path}\0${row.bytes}\0${row.sha256}\n`).join('')),
};
let fixtures = null;
if (mode === 'replay') fixtures = JSON.parse(readFileSync(fixturesFile, 'utf8'));

const serverLog = [];
const root = path.resolve(build);
const server = createServer((req, res) => {
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname); }
  catch { res.writeHead(400).end(); return; }
  let file = path.resolve(root, `.${pathname}`);
  if (file !== root && !file.startsWith(`${root}${path.sep}`)) { res.writeHead(403).end(); return; }
  if (!existsSync(file) || !statSync(file).isFile()) file = path.join(root, 'index.html');
  const raw = readFileSync(file);
  const type = mime(file);
  const gzip = isCompressible(type) && /(?:^|,)\s*gzip\b/i.test(req.headers['accept-encoding'] ?? '');
  const body = gzip ? gzipSync(raw, { level: 6, mtime: 0 }) : raw;
  const row = {
    order: serverLog.length + 1, method: req.method,
    path: pathname, servedPath: path.relative(root, file).split(path.sep).join('/'),
    fallbackToSpa: path.relative(root, file).split(path.sep).join('/') === 'index.html' && pathname !== '/',
    requestStartMs: Number(elapsedMs().toFixed(2)), status: 200, contentType: type,
    contentEncoding: gzip ? 'gzip' : 'identity', originalBytes: raw.length,
    encodedBytes: body.length, responseEndMs: null,
  };
  serverLog.push(row);
  res.writeHead(200, { 'Content-Type': type, 'Content-Length': String(body.length), 'Cache-Control': 'no-store', 'Vary': 'Accept-Encoding', ...(gzip ? { 'Content-Encoding': 'gzip' } : {}) });
  res.end(body, () => { row.responseEndMs = Number(elapsedMs().toFixed(2)); });
});

const browser = await chromium.launch({ headless: true });
let context;
let page;
let browserStart = null;
let readyObserved = null;
let domContentLoadedObserved = null;
const browserLog = { requests: [], responses: [], failed: [], pageErrors: [], consoleErrors: [] };
const capturedFixtures = new Map();
const fixtureCaptureErrors = [];
const fixtureCaptureTasks = [];
const replayLog = [];
const replayCounts = new Map();
const requestStartTimes = new WeakMap();
const apiFixtureKey = (method, url) => {
  const parsed = new URL(url);
  return `${method.toUpperCase()} ${parsed.pathname}${parsed.search}`;
};
const isBackendRequest = (url) => {
  try {
    const parsed = new URL(url);
    return parsed.hostname === '127.0.0.1' && parsed.port === '8000';
  } catch { return false; }
};

try {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const origin = `http://127.0.0.1:${address.port}`;
  context = await browser.newContext({ locale: 'fr-FR', viewport: { width: 1365, height: 900 }, serviceWorkers: mode === 'capture' ? 'allow' : 'block' });
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
  page.on('pageerror', (error) => browserLog.pageErrors.push({ atMs: Number((elapsedMs() - browserStart).toFixed(2)), message: error.message }));
  page.on('console', (message) => { if (message.type() === 'error') browserLog.consoleErrors.push({ atMs: Number((elapsedMs() - browserStart).toFixed(2)), text: message.text() }); });
  page.on('request', (request) => {
    const atMs = Number((elapsedMs() - browserStart).toFixed(2));
    requestStartTimes.set(request, atMs);
    browserLog.requests.push({ atMs, method: request.method(), url: request.url(), resourceType: request.resourceType() });
  });
  page.on('response', (response) => {
    const task = (async () => {
    const request = response.request();
    const headers = await response.allHeaders().catch(() => ({}));
    const row = { atMs: Number((elapsedMs() - browserStart).toFixed(2)), url: response.url(), status: response.status(), resourceType: request.resourceType(), contentEncoding: headers['content-encoding'] ?? null, contentLength: headers['content-length'] ?? null };
    browserLog.responses.push(row);
    if (mode === 'capture' && isBackendRequest(response.url())) {
      try {
        const body = await response.body();
        const key = apiFixtureKey(request.method(), response.url());
        const rows = capturedFixtures.get(key) ?? [];
        rows.push({
          occurrence: rows.length + 1,
          status: response.status(),
          headers: { 'content-type': headers['content-type'] ?? 'application/json' },
          bodyBase64: body.toString('base64'),
          bodySha256: hash(body),
          bodyBytes: body.length,
          requestAtMs: requestStartTimes.get(request) ?? null,
          responseAtMs: row.atMs,
        });
        capturedFixtures.set(key, rows);
      } catch (error) {
        fixtureCaptureErrors.push({ url: response.url(), message: error.message });
      }
    }
    })();
    fixtureCaptureTasks.push(task);
  });
  page.on('requestfailed', (request) => {
    const atMs = Number((elapsedMs() - browserStart).toFixed(2));
    browserLog.failed.push({ atMs, durationMs: Math.max(0, atMs - (requestStartTimes.get(request) ?? atMs)), method: request.method(), url: request.url(), resourceType: request.resourceType(), error: request.failure()?.errorText ?? null });
  });

  if (mode === 'replay') {
    const fixtureMap = fixtures.responses;
    await page.route('http://127.0.0.1:8000/**', async (route) => {
      const request = route.request();
      const parsed = new URL(request.url());
      const key = apiFixtureKey(request.method(), request.url());
      const index = replayCounts.get(key) ?? 0;
      replayCounts.set(key, index + 1);
      const variants = fixtureMap[key];
      if (variants?.length) {
        const fixture = variants[Math.min(index, variants.length - 1)];
        const delayMs = Math.max(0, (fixture.responseAtMs ?? 0) - (fixture.requestAtMs ?? 0));
        replayLog.push({ key, action: 'fulfill', occurrence: index + 1, sourceOccurrence: fixture.occurrence, status: fixture.status, bodySha256: fixture.bodySha256, delayMs });
        if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs));
        await route.fulfill({ status: fixture.status, headers: fixture.headers, body: Buffer.from(fixture.bodyBase64, 'base64') });
      } else if (fixtures.failedApiKeys.includes(key)) {
        replayLog.push({ key, action: 'abort', occurrence: index + 1, error: 'failed' });
        const delayMs = fixtures.failedApiDelaysMs[key] ?? 0;
        if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs));
        await route.abort('failed');
      } else {
        replayLog.push({ key, action: 'unmatched-abort', occurrence: index + 1 });
        await route.abort('failed');
      }
    });
  }

  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: profile.cdpLatencyMs, downloadThroughput: profile.downloadMbps * 1024 * 1024 / 8, uploadThroughput: profile.uploadMbps * 1024 * 1024 / 8, connectionType: 'wifi' });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: profile.cpuThrottlingRate });
  await page.addInitScript((marker) => {
    const check = () => {
      const home = document.querySelector('[data-testid="home-screen"]');
      if (home && document.documentElement.lang.toLowerCase().startsWith('fr') && home.innerText.includes(marker) && !performance.getEntriesByName('openhands-translated-home-ready').length) performance.mark('openhands-translated-home-ready');
    };
    const observer = new MutationObserver((records) => {
      for (const record of records) if (record.type === 'attributes' && ['lang', 'dir'].includes(record.attributeName)) (window.__openhandsLocaleTimeline ??= []).push({ atMs: performance.now(), lang: document.documentElement.lang, dir: document.documentElement.dir });
      check();
    });
    const begin = () => {
      window.__openhandsLocaleTimeline = [{ atMs: performance.now(), lang: document.documentElement.lang, dir: document.documentElement.dir }];
      observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['lang', 'dir'] });
      check();
    };
    if (document.documentElement) begin(); else document.addEventListener('DOMContentLoaded', begin, { once: true });
  }, readyText);

  browserStart = elapsedMs();
  await page.goto(origin, { waitUntil: 'domcontentloaded', timeout: 90_000 });
  domContentLoadedObserved = Number((elapsedMs() - browserStart).toFixed(2));
  let readinessError = null;
  try {
    await page.waitForFunction((marker) => {
      const home = document.querySelector('[data-testid="home-screen"]');
      return Boolean(home && document.documentElement.lang.toLowerCase().startsWith('fr') && home.innerText.includes(marker));
    }, readyText, { timeout: readyTimeoutMs });
  } catch (error) { readinessError = error.message; }
  readyObserved = Number((elapsedMs() - browserStart).toFixed(2));
  if (!readinessError) await page.waitForTimeout(postReadyObservationMs);
  if (mode === 'capture') await Promise.all(fixtureCaptureTasks);
  const appState = await page.evaluate(() => ({
    title: document.title, htmlLang: document.documentElement.lang, htmlDir: document.documentElement.dir,
    localeTimeline: window.__openhandsLocaleTimeline ?? [],
    readyMark: performance.getEntriesByName('openhands-translated-home-ready').at(-1)?.startTime ?? null,
    visibleText: document.body.innerText,
    storage: { i18nextLng: localStorage.getItem('i18nextLng'), locale: localStorage.getItem('context.locale'), onboarded: localStorage.getItem('openhands-onboarded') },
  }));

  const failedApi = new Map();
  for (const row of browserLog.failed) {
    const parsed = new URL(row.url);
    if (isBackendRequest(row.url)) {
      const key = apiFixtureKey(row.method, row.url);
      const list = failedApi.get(key) ?? [];
      list.push({ atMs: row.atMs, durationMs: row.durationMs });
      failedApi.set(key, list);
    }
  }
  if (mode === 'capture') {
    const failedApiKeys = [...failedApi.keys()];
    const fixtureOutput = {
      schemaVersion: 1,
      capturedFrom: { sourceCommit, buildPath: build, buildSha256: buildManifest.sha256, mode: 'existing VITE_MOCK_API=true build, MSW worker active' },
      seed: { 'i18nextLng': 'fr', 'context.locale': 'fr', 'openhands-backends': [{ id: 'probe-local', name: 'Mock local', host: 'http://127.0.0.1:8000', apiKey: 'mock-key', kind: 'local' }], 'openhands-active-backend': { backendId: 'probe-local', orgId: null }, 'openhands-onboarded': '1' },
      responses: Object.fromEntries(capturedFixtures),
      failedApiKeys,
      failedApiDelaysMs: Object.fromEntries([...failedApi].map(([key, rows]) => [key, Math.max(0, ...rows.map((row) => row.durationMs ?? 0))])),
      captureErrors: fixtureCaptureErrors,
      note: 'Response bodies are preserved as base64 bytes with status and content-type. Failures are recorded separately and replayed as request aborts. Request/response delay is captured to approximate the same mock wait outside the production client bundle.',
    };
    mkdirSync(path.dirname(fixturesFile), { recursive: true });
    writeFileSync(fixturesFile, `${JSON.stringify(fixtureOutput, null, 2)}\n`);
  }

  const result = {
    schemaVersion: 1, mode, capturedAt: new Date().toISOString(),
    source: { path: source, commit: sourceCommit, dirtyStatus: sourceStatus, appPackage: packageJson.name, appVersion: packageJson.version, node: process.version, runtimeVersions: Object.fromEntries(['vite', 'react-router', 'i18next', 'i18next-http-backend', 'i18next-browser-languagedetector', 'playwright'].map((name) => [name, readPackageVersion(name)])), auditFiles: sourceFiles, catalogShape: { translationDefinitionCount: Object.keys(translations).length, locales, enumCount: (readFileSync(path.join(source, 'src/i18n/declaration.ts'), 'utf8').match(/^  [A-Z0-9_$]+ = /gm) ?? []).length } },
    artifact: { buildPath: build, manifest: buildManifest, files: buildFiles },
    profile: { ...profile, note: 'CDP latency is an emulated per-request value intended as approximately 80 ms RTT; it is not a calibrated network RTT. Throughput is bytes/sec derived from 20 Mbps.' },
    seed: { contextLocale: 'fr-FR', i18nextLng: 'fr', contextLocaleStorage: 'fr', backend: { id: 'probe-local', name: 'Mock local', host: 'http://127.0.0.1:8000', apiKey: 'mock-key', kind: 'local' }, activeBackend: { backendId: 'probe-local', orgId: null }, onboarded: '1' },
    buildMode: mode === 'capture' ? 'VITE_MOCK_API=true; MSW worker active' : 'npm run build:app; VITE_MOCK_API unset/false; API responses replayed by Playwright outside bundle',
    fixtures: { path: fixturesFile, sha256: mode === 'replay' ? hash(readFileSync(fixturesFile)) : null, capturedApiKeys: Object.keys(fixtures?.responses ?? Object.fromEntries(capturedFixtures)), replayLog, unmatchedReplayRequests: replayLog.filter((entry) => entry.action === 'unmatched-abort') },
    readiness: { marker: `home-screen with ${readyText} and document lang beginning fr`, performanceMarkMs: appState.readyMark, playwrightObservedMs: readinessError ? null : readyObserved, readinessError, domContentLoadedObservedMs: domContentLoadedObserved, postReadyObservationMs, state: appState },
    staticServer: { compression: 'gzip level 6 for compressible text MIME types, Content-Length equals encoded entity bytes', requests: serverLog, requestCount: serverLog.length, encodedBytes: serverLog.reduce((sum, row) => sum + row.encodedBytes, 0), identityResponses: serverLog.filter((row) => row.contentEncoding === 'identity').length },
    browserNetwork: browserLog,
  };
  if (mode === 'capture') result.fixtureCapture = { path: fixturesFile, responseKeys: [...capturedFixtures.keys()], failedApiKeys: [...failedApi.keys()], captureErrors: fixtureCaptureErrors };
  mkdirSync(path.dirname(output), { recursive: true });
  writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({ mode, output, fixturesFile: mode === 'capture' ? fixturesFile : undefined, staticRequests: serverLog.length, encodedBytes: result.staticServer.encodedBytes, markerMs: result.readiness.performanceMarkMs, htmlLang: appState.htmlLang, responses: browserLog.responses.length, failed: browserLog.failed.length, replayMismatch: result.fixtures.unmatchedReplayRequests }, null, 2)}\n`);
} finally {
  await context?.close();
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
