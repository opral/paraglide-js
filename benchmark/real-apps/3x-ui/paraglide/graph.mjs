import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync, brotliCompressSync, constants } from 'node:zlib';

const mode = process.env.GRAPH_MODE;
if (!['native-es2022', 'paraglide', 'paraglide-all-html'].includes(mode)) {
	throw new Error('Set GRAPH_MODE to native-es2022, paraglide, or paraglide-all-html');
}
const dist = path.resolve(process.env.DIST_DIR ?? '');
if (!process.env.DIST_DIR) throw new Error('Set DIST_DIR to the production dist directory');
const manifest = JSON.parse(await readFile(path.join(dist, '.vite/manifest.json'), 'utf8'));
const seen = new Set();
const files = [];

function visit(key) {
	if (seen.has(key)) return;
	seen.add(key);
	const entry = manifest[key];
	if (!entry) throw new Error(`Missing manifest entry: ${key}`);
	for (const imported of entry.imports ?? []) visit(imported);
	files.push({ key, file: entry.file, kind: 'js' });
	for (const css of entry.css ?? []) files.push({ key: css, file: css, kind: 'css' });
}

visit('login.html');
let localeKeys;
if (mode === 'native-es2022') {
	const queryProvider = Object.keys(manifest).find((key) => key.startsWith('_QueryProvider-'));
	localeKeys = manifest[queryProvider]?.dynamicImports?.filter((key) => key.endsWith('/es-ES.json')) ?? [];
} else {
	localeKeys = [
		'paraglide:client-locale-split:locale:en-US',
		'paraglide:client-locale-split:locale:es-ES',
	];
	if (mode === 'paraglide-all-html') {
		const preloadKey = 'paraglide:client-locale-split:preload';
		if (!manifest[preloadKey]) throw new Error(`Missing preload asset: ${preloadKey}`);
		visit(preloadKey);
	}
}
if (localeKeys.length !== (mode === 'native-es2022' ? 1 : 2)) {
	throw new Error(`Unexpected locale graph: ${JSON.stringify(localeKeys)}`);
}
for (const key of localeKeys) {
	const entry = manifest[key];
	if (!entry) throw new Error(`Missing expected locale: ${key}`);
	for (const imported of entry.imports ?? []) visit(imported);
	files.push({ key, file: entry.file, kind: 'locale' });
}
files.push({ key: 'login.html', file: 'login.html', kind: 'html' });

const unique = new Map(files.map((entry) => [entry.file, entry]));
const assets = [];
for (const entry of unique.values()) {
	const bytes = await readFile(path.join(dist, entry.file));
	assets.push({
		...entry,
		bytes: bytes.length,
		gzipLevel9: gzipSync(bytes, { level: 9 }).length,
		brotliQ4: brotliCompressSync(bytes, {
			params: { [constants.BROTLI_PARAM_QUALITY]: 4 },
		}).length,
		sha256: createHash('sha256').update(bytes).digest('hex'),
	});
}
const totals = assets.reduce((result, asset) => ({
	raw: result.raw + asset.bytes,
	gzipLevel9: result.gzipLevel9 + asset.gzipLevel9,
	brotliQ4: result.brotliQ4 + asset.brotliQ4,
	files: result.files + 1,
}), { raw: 0, gzipLevel9: 0, brotliQ4: 0, files: 0 });
const result = { mode, entry: 'login.html', selectedLocale: 'es-ES', localeKeys, assets, totals };
const output = process.env.OUTPUT_FILE
	? path.resolve(process.env.OUTPUT_FILE)
	: path.resolve(path.dirname(fileURLToPath(import.meta.url)), `${mode}-route-asset-graph.json`);
await writeFile(output, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ output, totals }, null, 2));
