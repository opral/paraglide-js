import { writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const origin = process.env.ORIGIN || 'http://127.0.0.1:4176';
const outputFile = process.env.OUTPUT_FILE || './native-route.json';
const locale = process.env.LOCALE || 'fr-FR';
const routePath=process.env.ROUTE_PATH||'/login?redirect=false';
const readinessText=process.env.READY_TEXT||'Content de te revoir';
let chromium;
if (process.env.PLAYWRIGHT_MODULE) {
  const moduleUrl = pathToFileURL(resolve(process.env.PLAYWRIGHT_MODULE));
  ({ chromium } = await import(moduleUrl.href));
} else {
  const require = createRequire(resolve(process.env.PLAYWRIGHT_RESOLVE_FROM || `${process.cwd()}/package.json`));
  ({ chromium } = require('playwright'));
}

const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH, args: ['--no-sandbox'] });
try {
  const mobile = process.env.PROFILE === 'mobile';
  const context = await browser.newContext({ locale, serviceWorkers: 'block', viewport: mobile ? {width:390,height:844} : {width:1280,height:800}, isMobile: mobile, hasTouch: mobile });
  await context.addCookies([{ name: 'lang', value: locale, domain: new URL(origin).hostname, path: '/' }]);
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  const mediaTransport=new Map();
  cdp.on('Network.requestWillBeSent',p=>{if(p.request.url.includes('/assets/silence.mp3'))mediaTransport.set(p.requestId,{url:p.request.url,encodedDataBytes:0,decodedDataBytes:0,chunks:[],epochOffsetMs:p.wallTime*1000-p.timestamp*1000});});
  cdp.on('Network.dataReceived',p=>{const m=mediaTransport.get(p.requestId);if(m){m.encodedDataBytes+=p.encodedDataLength;m.decodedDataBytes+=p.dataLength;m.chunks.push({epochMs:p.timestamp*1000+m.epochOffsetMs,encodedBytes:p.encodedDataLength,decodedBytes:p.dataLength});}});
  const requests = new Map();
  const failures=[];
  page.on('request',request=>{if(!request.url().startsWith(origin+'/'))return;let resolve;const promise=new Promise(r=>resolve=r);requests.set(request,{url:request.url(),promise,resolve,done:false});});
  page.on('requestfinished',request=>{const r=requests.get(request);if(r){r.done=true;r.resolve();}});
  page.on('requestfailed',request=>{const r=requests.get(request);if(r){r.done=true;r.failed=request.failure()?.errorText;r.resolve();failures.push({url:request.url(),error:r.failed});}});
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: mobile ? 150 : 80,
    downloadThroughput: (mobile ? 1.6 : 20) * 1e6 / 8,
    uploadThroughput: 2 * 1e6 / 8,
    connectionType: 'cellular4g',
  });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: mobile ? 4 : 3 });

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

  await page.addInitScript(needle=>{window.__expectedReady=needle},readinessText);
  await page.addInitScript(() => {
    window.__probe = { translatedReadyMs: null, fcpMs: null, lcpMs: null };
    const record = () => {
      if (
        window.__probe.translatedReadyMs == null &&
        document.body?.innerText.includes(window.__expectedReady)
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
  await page.goto(`${origin}${routePath}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.getByText(readinessText,{exact:true}).waitFor({state:'visible',timeout:30000});
  const fontReadyMs = await page.evaluate(async () => {
    await document.fonts.ready;
    return Math.round(performance.now());
  });
  const cutoff = await page.evaluate(()=>performance.timeOrigin+window.__probe.translatedReadyMs);
  const initialRequests=[...requests.entries()].filter(([request])=>request.timing().startTime<=cutoff);
  const persistentMedia = initialRequests.filter(([,r])=>r.url.endsWith('/assets/silence.mp3'));
  const ordinaryRequests = initialRequests.filter(([,r])=>!r.url.endsWith('/assets/silence.mp3'));
  let deadline;
  try {
    await Promise.race([Promise.all(ordinaryRequests.map(([,r])=>r.promise)),new Promise((_,reject)=>{deadline=setTimeout(()=>reject(new Error('Requests started before readiness did not complete')),30000);})]);
  } catch(error) {
    await writeFile(outputFile.replace(/\.json$/,'.failed.json'),JSON.stringify({cutoff,requests:initialRequests.map(([request,r])=>({url:r.url,timing:request.timing(),done:r.done,failed:r.failed})),body:await page.evaluate(()=>document.body.innerText)},null,2));throw error;
  } finally {clearTimeout(deadline);}
  const completedRequests=[];
  for(const [request,r] of initialRequests){
    const response=await request.response();
    const headers=response ? await response.allHeaders():{};
    const sizes=r.done ? await request.sizes().catch(()=>null) : null;
    completedRequests.push({url:r.url,resourceType:request.resourceType(),requestRange:(await request.allHeaders())['range']||null,startEpochMs:request.timing().startTime,timing:request.timing(),status:response?.status(),done:r.done,failed:r.failed,contentEncoding:headers['content-encoding'],contentLength:Number(headers['content-length']||0),sizes});
  }
  const result = await page.evaluate(() => {
    const resources = performance.getEntriesByType('resource').filter(entry=>entry.startTime<=window.__probe.translatedReadyMs).map((entry) => ({
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
    browserVersion: browser.version(),
    persistentMediaTransport:[...mediaTransport.values()].map(m=>({...m,encodedBytesReceivedByReady:m.chunks.filter(c=>c.epochMs<=cutoff).reduce((sum,c)=>sum+c.encodedBytes,0)})),
    measurementValidity: {uiParity:true,readinessTimingQualified:true,completedOrdinaryRequestAccounting:true,allRequestsClosed:persistentMedia.every(([,r])=>r.done),note:'Chrome native audio document iframe may retain open request despite HTTP response. It is retained explicitly with content length and received byte counters; incomplete closed-set samples make no aggregate byte/performance claim.'},
    playwrightVersion: createRequire(resolve(process.env.PLAYWRIGHT_MODULE))('./package.json').version,
    browserExecutable: process.env.CHROMIUM_PATH,
    profile: process.env.PROFILE || 'desktop',
    resourcesStartedBeforeReadyCompleted: completedRequests,
    completedHttpEncodedBodyBytesIncludingNavigation: completedRequests.filter(r=>r.done).reduce((sum,r)=>sum+(r.sizes?.responseBodySize??r.contentLength),0),
    wholeRequestEncodedBodyByteBoundsIncludingNavigation: {lower:completedRequests.filter(r=>r.done).reduce((sum,r)=>sum+(r.sizes?.responseBodySize??r.contentLength),0),upper:completedRequests.reduce((sum,r)=>sum+(r.done?(r.sizes?.responseBodySize??r.contentLength):r.contentLength),0)},
    failures,
    network: {latencyMs:mobile?150:80,downloadMbps:mobile?1.6:20,uploadMbps:2,cpuRate:mobile?4:3},
    appCommit: process.env.SOURCE_COMMIT || 'e1dfc10449ff713faffacd60273fddcfe2c0a698',
    route: routePath,
    selectedLocale: `${locale} normalized to ${result.locale}`,
    method:
      'UI parity only with persistent MP3 iframe reported separately; cache and service workers disabled,explicit desktop/mobile network+CPU profile,Brotli-Q4 precomputed,read-only fixtures; Playwright request-object closed set includes subframe/audio/navigation and every request started before translated readiness once completed',
    wallMs: Date.now() - wallStart,
    api,
    ...result,
    fontReadyMs,
    errors,
  };
  await writeFile(outputFile, `${JSON.stringify(report, null, 2)}\n`);
  await page.screenshot({path:outputFile.replace(/\.json$/,'.png'),fullPage:true});
  console.log(JSON.stringify({file:outputFile,profile:report.profile,locale:report.locale,readyMs:report.translatedReadyMs,encodedBytes:report.resourceEncodedBodyBytes,errors:report.errors}));
  if(errors.length||failures.length)throw new Error('UI sample has page errors or failed network requests');
  await context.close();
} finally {
  await browser.close();
}
