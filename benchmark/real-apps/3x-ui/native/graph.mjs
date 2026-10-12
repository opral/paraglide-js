import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { gzipSync, brotliCompressSync, constants } from 'node:zlib';
import path from 'node:path';

const dist = path.resolve(import.meta.dirname, '../../../internal/web/dist');
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
const queryProvider = Object.keys(manifest).find((key) => key.startsWith('_QueryProvider-'));
const localeKey = manifest[queryProvider].dynamicImports.find((key) => key.endsWith('/es-ES.json'));
if (!localeKey) throw new Error('The Spanish dynamic locale is missing from the login import graph');
files.push({ key: localeKey, file: manifest[localeKey].file, kind: 'selected-locale-js' });
files.push({ key: 'login.html', file: 'login.html', kind: 'html' });
const unique = new Map(files.map((entry) => [entry.file, entry]));
const assets = [];
for (const entry of unique.values()) {
  const bytes = await readFile(path.join(dist, entry.file));
  assets.push({
    ...entry,
    bytes: bytes.length,
    gzipLevel9: gzipSync(bytes, { level: 9 }).length,
    brotliQ4: brotliCompressSync(bytes, { params: { [constants.BROTLI_PARAM_QUALITY]: 4 } }).length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  });
}
const totals = assets.reduce((result, asset) => ({
  raw: result.raw + asset.bytes,
  gzipLevel9: result.gzipLevel9 + asset.gzipLevel9,
  brotliQ4: result.brotliQ4 + asset.brotliQ4,
  files: result.files + 1,
}), { raw: 0, gzipLevel9: 0, brotliQ4: 0, files: 0 });
const result = { entry: 'login.html', selectedLocale: 'es-ES', selectedLocaleManifestKey: localeKey, assets, totals };
await writeFile(new URL('./route-asset-graph.json', import.meta.url), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result, null, 2));
