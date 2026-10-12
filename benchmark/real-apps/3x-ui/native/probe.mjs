import { chromium } from 'playwright';
import { writeFile } from 'node:fs/promises';

const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
try {
  const context = await browser.newContext({ locale: 'en-US' });
  await context.addCookies([{ name: 'lang', value: 'es-ES', domain: '127.0.0.1', path: '/' }]);
  const page = await context.newPage();
  const requests = [];
  const responses = [];
  const errors = [];
  page.on('request', (request) => requests.push({ url: request.url(), method: request.method() }));
  page.on('response', (response) => responses.push({ url: response.url(), status: response.status() }));
  page.on('requestfailed', (request) => errors.push(`failed ${request.url()} ${request.failure()?.errorText}`));
  page.on('pageerror', (error) => errors.push(`page ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console ${message.text()}`);
  });

  await page.goto('http://127.0.0.1:4173/login', { waitUntil: 'networkidle', timeout: 30000 });
  await page.locator('input[placeholder="Contraseña"]').waitFor({ state: 'visible', timeout: 10000 });
  const visible = await page.evaluate(() => ({
    title: document.title,
    body: document.body.innerText,
    usernamePlaceholder: document.querySelector('input[placeholder="Nombre de Usuario"]')?.getAttribute('placeholder'),
    passwordPlaceholder: document.querySelector('input[placeholder="Contraseña"]')?.getAttribute('placeholder'),
    languageButton: [...document.querySelectorAll('button')].map((button) => button.getAttribute('aria-label')).find((label) => label === 'Idioma'),
  }));
  const origin = 'http://127.0.0.1:4173';
  const result = {
    route: '/login',
    cookie: 'lang=es-ES',
    visible,
    errors,
    requests: requests.map((request) => ({ ...request, path: request.url.replace(origin, '') })),
    responses: responses.map((response) => ({ path: response.url.replace(origin, ''), status: response.status })),
    localeRequests: requests.map((request) => request.url.replace(origin, '')).filter((path) => /assets\/(ar-EG|es-ES|fa-IR|id-ID|ja-JP|pt-BR|ru-RU|tr-TR|uk-UA|vi-VN|zh-CN|zh-TW)-/.test(path)),
    note: 'The server provides read-only fixtures for CSRF, getTwoFactorEnable, and sponsors; it does not submit login credentials or contact a backend.',
  };
  await writeFile(new URL('./route-smoke.json', import.meta.url), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result, null, 2));
} finally {
  await browser.close();
}
