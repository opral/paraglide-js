import { pathToFileURL } from 'node:url';
const playwrightModule = process.env.PLAYWRIGHT_MODULE;
if (!playwrightModule) throw new Error('Set PLAYWRIGHT_MODULE to the installed Playwright entry point');
const { chromium } = await import(pathToFileURL(playwrightModule).href);
const origin = process.env.NATIVE_ORIGIN ?? 'http://127.0.0.1:4183';
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const cases = [
  { name: 'panel-valid', path: '/login', cookies: [{ name: 'lang', value: 'es-ES' }], expectSpanish: true },
  { name: 'panel-invalid', path: '/login', cookies: [{ name: 'lang', value: 'not-a-locale' }], expectSpanish: false },
  { name: 'panel-absent', path: '/login', cookies: [], expectSpanish: false },
  { name: 'subscription-subLang', path: '/subpage.html', cookies: [{ name: 'subLang', value: 'es-ES' }], expectSpanish: true },
  { name: 'subscription-fallback-lang', path: '/subpage.html', cookies: [{ name: 'lang', value: 'es-ES' }], expectSpanish: true },
  { name: 'subscription-invalid-subLang-wins', path: '/subpage.html', cookies: [{ name: 'subLang', value: 'not-a-locale' }, { name: 'lang', value: 'es-ES' }], expectSpanish: false },
];
const results=[];
try {
  for (const test of cases) {
    const context=await browser.newContext({ locale:'en-US', serviceWorkers:'block' });
    if (test.cookies.length) await context.addCookies(test.cookies.map((cookie)=>({ ...cookie, domain:'127.0.0.1', path:'/' })));
    const page=await context.newPage();
    const errors=[]; const esRequests=[];
    page.on('pageerror', e=>errors.push(e.message));
    page.on('request', req=>{if (/\/assets\/es-ES-[^/]+\.js$/.test(new URL(req.url()).pathname)) esRequests.push({url:new URL(req.url()).pathname, at:Math.round(req.timing().startTime)});});
    await page.goto(`${origin}${test.path}`, { waitUntil:'domcontentloaded', timeout:30000 });
    await page.waitForTimeout(1200);
    const pageInfo=await page.evaluate(()=>({text:document.body.innerText.slice(0,500), scriptOrder:[...document.querySelectorAll('script')].map(x=>({type:x.type,src:x.src,inline:x.src===''&&x.textContent.includes("a.rel='modulepreload'")}))}));
    results.push({name:test.name,path:test.path,cookies:test.cookies,expectSpanish:test.expectSpanish,esRequested:esRequests.length>0,esRequestCount:esRequests.length,esRequests,pageInfo,errors});
    await context.close();
  }
} finally { await browser.close(); }
console.log(JSON.stringify({origin:'native early-locale control',results},null,2));
