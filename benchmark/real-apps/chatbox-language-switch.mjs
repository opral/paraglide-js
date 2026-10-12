import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
const distArg = process.argv[2];
if (!distArg) throw new Error('Usage: node chatbox-language-switch.mjs <paraglide-renderer-dist>');
const dist = path.resolve(distArg);
const { chromium } = await import('playwright');
const server = http.createServer(async (req, res) => {
	const pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://127.0.0.1').pathname);
	if (pathname.startsWith('/api/') || pathname.startsWith('/ollama/')) { res.writeHead(404).end('{}'); return; }
	let file = path.resolve(dist, `.${pathname}`);
	if (!file.startsWith(`${dist}${path.sep}`) && file !== dist) { res.writeHead(403).end(); return; }
	try { if (!(await fs.stat(file)).isFile()) file = path.join(dist, 'index.html'); } catch { file = path.join(dist, 'index.html'); }
	const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
	res.writeHead(200, { 'content-type': types[path.extname(file)] ?? 'application/octet-stream' }).end(await fs.readFile(file));
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
try {
	const context = await browser.newContext({ viewport: { width: 1365, height: 768 }, locale: 'fr-FR', serviceWorkers: 'block' });
	const page = await context.newPage();
	const origin = `http://127.0.0.1:${server.address().port}`;
	await page.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
	await page.goto(`${origin}/`, { waitUntil: 'domcontentloaded', timeout: 30000 });
	await page.waitForTimeout(5500);
	await page.getByText('Paramètres', { exact: true }).first().click();
	await page.waitForTimeout(1000);
	await page.getByText('Paramètres généraux', { exact: true }).first().click();
	await page.waitForTimeout(1000);
	const beforeSwitch = await page.locator('body').innerText();
	await page.locator('input[readonly][value="Français"]').click();
	await page.getByText('English', { exact: true }).last().click();
	await page.waitForTimeout(1500);
	const snapshot = await page.evaluate(() => ({
		url: location.pathname,
		text: document.body.innerText.slice(0, 1400),
	}));
	const checks = {
		frenchSectionBeforeSwitch: beforeSwitch.includes('Épinglés'),
		frenchToolbarBeforeSwitch: beforeSwitch.includes('Nouvelle discussion'),
		englishSectionAfterSwitch: snapshot.text.includes('Pinned'),
		englishToolbarAfterSwitch: snapshot.text.includes('New Chat'),
	};
	console.log(JSON.stringify({ beforeSwitch: beforeSwitch.slice(0, 1400), afterSwitch: snapshot.text }, null, 2));
	if (Object.values(checks).some(value => !value)) throw new Error(`UI language-switch parity failed: ${JSON.stringify(checks)}`);
	console.log(JSON.stringify(checks));
	await context.close();
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
