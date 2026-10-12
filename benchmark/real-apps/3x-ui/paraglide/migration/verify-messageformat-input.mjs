import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const frontendRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const translationRoot = path.resolve(frontendRoot, '../internal/web/translation');
const projectMessages = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../messages');
const compilerRoot = process.env.PARAGLIDE_REPO;
if (!compilerRoot) throw new Error('Set PARAGLIDE_REPO to the pinned Paraglide checkout');
const pluginPath = path.join(compilerRoot, 'node_modules/@inlang/plugin-message-format/dist/index.js');
const plugin = (await import(pathToFileURL(pluginPath))).default;

function flatten(value, prefix = '', result = Object.create(null)) {
  for (const [key, child] of Object.entries(value)) {
    if (key === '$schema') continue;
    const id = prefix ? `${prefix}.${key}` : key;
    if (child && typeof child === 'object' && !Array.isArray(child)) flatten(child, id, result);
    else if (typeof child === 'string') result[id] = child;
    else throw new Error(`Non-string leaf at ${id}`);
  }
  return result;
}

function expectedPattern(text) {
  const parts = [];
  const input = /(?<!\{)\{([A-Za-z_$][\w$]*)\}(?!\})/g;
  let cursor = 0;
  for (const match of text.matchAll(input)) {
    if (match.index > cursor) parts.push({ type: 'text', value: text.slice(cursor, match.index) });
    parts.push({ type: 'expression', name: match[1] });
    cursor = match.index + match[0].length;
  }
  if (cursor < text.length) parts.push({ type: 'text', value: text.slice(cursor) });
  if (parts.length === 0) return [{ type: 'text', value: text }];
  return parts;
}

const localeFiles = (await readdir(projectMessages)).filter((file) => file.endsWith('.json')).sort();
const files = await Promise.all(localeFiles.map(async (file) => ({
  locale: file.slice(0, -5),
  metadata: { path: `./messages/${file}` },
  content: new TextEncoder().encode(await readFile(path.join(projectMessages, file), 'utf8')),
})));
const imported = await plugin.importFiles({ files });
const sourceLocales = await readdir(translationRoot);
const source = new Map();
for (const file of sourceLocales.filter((name) => name.endsWith('.json'))) {
  source.set(file.slice(0, -5), flatten(JSON.parse(await readFile(path.join(translationRoot, file), 'utf8'))));
}
const actual = new Map();
for (const variant of imported.variants) {
  const pattern = variant.pattern.map((part) => part.type === 'expression'
    ? { type: 'expression', name: part.arg?.name }
    : { type: part.type, value: part.value });
  actual.set(`${variant.messageLocale}\0${variant.messageBundleId}`, pattern);
}

let checked = 0;
const mismatches = [];
for (const [locale, messages] of source) {
  for (const [id, text] of Object.entries(messages)) {
    const key = `${locale}\0${id}`;
    const got = actual.get(key);
    const expected = expectedPattern(text);
    if (JSON.stringify(got) !== JSON.stringify(expected)) {
      if (mismatches.length < 12) mismatches.push({ locale, id, expected, got });
    }
    checked += 1;
  }
}

const result = {
  locales: source.size,
  keysPerLocale: source.get('en-US')?.length ?? Object.keys(source.get('en-US') ?? {}).length,
  importedBundles: imported.bundles.length,
  importedMessages: imported.messages.length,
  importedVariants: imported.variants.length,
  checked,
  mismatches: mismatches.length,
  examples: mismatches,
};
console.log(JSON.stringify(result, null, 2));
if (mismatches.length) process.exitCode = 1;
