import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { brotliDecompressSync, gunzipSync } from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';

const baseline = path.resolve(process.env.BASELINE_DIST || './baseline-dist');
const candidate = path.resolve(process.env.PRELOAD_DIST || './preload-dist');

function files(root) {
  const result = new Map();
  const visit = (directory) => {
    for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, item.name);
      if (item.isDirectory()) visit(absolute);
      else result.set(path.relative(root, absolute), fs.readFileSync(absolute));
    }
  };
  visit(root);
  return result;
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

const before = files(baseline);
const after = files(candidate);
assert.deepEqual([...after.keys()].sort(), [...before.keys()].sort(), 'build file sets differ');
const changed = [...after.keys()].sort().filter((file) => !before.get(file).equals(after.get(file)));
assert.deepEqual(changed, ['index.html', 'index.html.br', 'index.html.gz']);

const html = after.get('index.html');
assert(!html.includes(Buffer.from('__LIBRECHAT_NATIVE_LOCALE_PRELOAD__')));
for (const [file, decode] of [
  ['index.html.br', brotliDecompressSync],
  ['index.html.gz', gunzipSync],
]) {
  assert.deepEqual(decode(after.get(file)), html, `${file} does not match final index.html`);
}
const htmlText = html.toString('utf8');
assert(htmlText.indexOf('data-native-locale-preload-control') < htmlText.indexOf('<body>'));
assert(htmlText.includes("setAttribute('data-native-locale-preload',locale)"));

const javascript = [...after.keys()].filter((file) => file.endsWith('.js'));
assert(javascript.length > 0);
for (const file of javascript) {
  assert(before.get(file).equals(after.get(file)), `JavaScript changed: ${file}`);
}

console.log(JSON.stringify({
  baselineFiles: before.size,
  candidateFiles: after.size,
  changed,
  javascriptFilesByteIdentical: javascript.length,
  baselineHtmlSha256: sha256(before.get('index.html')),
  candidateHtmlSha256: sha256(html),
  candidateGzipSha256: sha256(after.get('index.html.gz')),
  candidateBrotliSha256: sha256(after.get('index.html.br')),
}, null, 2));
