import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const clientRoot = path.join(root, '.svelte-kit/output/client');
const serverRoot = path.join(root, '.svelte-kit/output/server');
const adapterRoot = path.join(root, 'build');
const manifest = JSON.parse(
	fs.readFileSync(path.join(clientRoot, 'paraglide-per-locale.json'), 'utf8')
);
const germanPrefix = '/_app/immutable/__paraglide/de-6465';

assert.equal(manifest.version, 1);
assert.equal(manifest.baseLocale, 'en');
assert.equal(manifest.locales.en.prefix, '');
assert.equal(manifest.locales.de.prefix, germanPrefix);

for (const [canonicalUrl, localizedUrl] of Object.entries(manifest.locales.de.assets)) {
	assert.ok(
		fs.existsSync(path.join(clientRoot, localizedUrl.slice(1))),
		`Missing mapped client asset ${localizedUrl} for ${canonicalUrl}`
	);
	if (localizedUrl.includes('/immutable/')) {
		assert.ok(
			fs.existsSync(path.join(adapterRoot, localizedUrl.slice(1))),
			`The SvelteKit adapter did not copy ${localizedUrl}`
		);
	}
}

const canonicalClient = readFiles(
	path.join(clientRoot, '_app/immutable'),
	(file) => !file.includes(`${path.sep}__paraglide${path.sep}`)
);
const germanClient = readFiles(path.join(clientRoot, germanPrefix.slice(1)));
const server = readFiles(serverRoot);

const englishWelcome = 'Welcome to the SvelteKit Paraglide JS example.';
const germanWelcome = 'Willkommen zum SvelteKit Paraglide JS Beispiel.';
const unused = 'This is an unused message to verify tree-shaking.';
assert.match(canonicalClient, new RegExp(escapeRegExp(englishWelcome)));
assert.doesNotMatch(canonicalClient, new RegExp(escapeRegExp(germanWelcome)));
assert.match(germanClient, new RegExp(escapeRegExp(germanWelcome)));
assert.doesNotMatch(germanClient, new RegExp(escapeRegExp(englishWelcome)));
assert.match(server, new RegExp(escapeRegExp(englishWelcome)));
assert.match(server, new RegExp(escapeRegExp(germanWelcome)));
assert.doesNotMatch(canonicalClient + germanClient, new RegExp(escapeRegExp(unused)));

for (const relativeHtml of ['index.html', 'about.html']) {
	assertHtmlUsesLocale(path.join(adapterRoot, relativeHtml), 'en');
}
for (const relativeHtml of ['de.html', 'de/about.html']) {
	assertHtmlUsesLocale(path.join(adapterRoot, relativeHtml), 'de');
}

for (const file of listFiles(path.join(clientRoot, germanPrefix.slice(1)))) {
	if (!file.endsWith('.js')) continue;
	const code = fs.readFileSync(file, 'utf8');
	for (const match of code.matchAll(/(?:\bfrom\s*|\bimport\s*\()\s*["']([^"']+)["']/g)) {
		const specifier = match[1];
		if (!specifier?.startsWith('.')) continue;
		const resolved = path.resolve(path.dirname(file), specifier.replace(/[?#].*$/, ''));
		assert.ok(fs.existsSync(resolved), `${path.relative(root, file)} imports missing ${specifier}`);
	}
}

const [{ Server }, { manifest: fullManifest }] = await Promise.all([
	import(pathToFileURL(path.join(serverRoot, 'index.js')).href),
	import(pathToFileURL(path.join(serverRoot, 'manifest-full.js')).href)
]);
const serverApp = new Server(fullManifest);
await serverApp.init({ env: {} });
for (const [locale, pathname] of [
	['en', '/'],
	['de', '/de']
]) {
	const response = await serverApp.respond(
		new Request(`http://paraglide.test${pathname}`, {
			headers: { accept: 'text/html' }
		}),
		{ getClientAddress: () => '127.0.0.1' }
	);
	assert.equal(response.status, 200);
	const html = await response.text();
	const link = response.headers.get('link') ?? '';
	if (locale === 'de') {
		assert.ok(html.includes(germanPrefix), 'German SSR HTML is canonical');
		assert.ok(link.includes(germanPrefix), 'German SSR Link header is canonical');
	} else {
		assert.ok(!html.includes('/__paraglide/'), 'English SSR HTML is localized');
		assert.ok(!link.includes('/__paraglide/'), 'English SSR Link is localized');
	}
}

console.log(
	'SvelteKit per-locale build verified: isolated en/de clients, prerender and live-SSR asset selection, Link headers, shared server, and closed imports.'
);

function assertHtmlUsesLocale(file, locale) {
	const html = fs.readFileSync(file, 'utf8');
	const references = Array.from(
		html.matchAll(/(?:href=|src=|import\()\s*["']([^"']+)["']/g),
		(match) => match[1]
	);
	const immutableReferences = references.filter((reference) =>
		reference.includes('_app/immutable/')
	);
	assert.ok(immutableReferences.length > 0, `No immutable assets in ${file}`);
	for (const reference of immutableReferences) {
		if (locale === 'de') {
			assert.ok(
				reference.includes('_app/immutable/__paraglide/de-6465/'),
				`German page references the canonical graph: ${reference}`
			);
		} else {
			assert.ok(
				!reference.includes('/__paraglide/'),
				`English page references a localized graph: ${reference}`
			);
		}
	}
	const favicon = references.find((reference) => reference.endsWith('favicon.png'));
	assert.ok(favicon, `Missing favicon in ${file}`);
	assert.ok(!favicon.includes('__paraglide'), `Public favicon was localized in ${file}`);
}

function readFiles(directory, include = () => true) {
	return listFiles(directory)
		.filter(include)
		.map((file) => fs.readFileSync(file, 'utf8'))
		.join('\n');
}

function listFiles(directory) {
	const files = [];
	for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
		const absolute = path.join(directory, entry.name);
		if (entry.isDirectory()) files.push(...listFiles(absolute));
		else files.push(absolute);
	}
	return files;
}

function escapeRegExp(value) {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
