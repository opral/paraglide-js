import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import i18next from 'i18next';

const scratch = path.dirname(fileURLToPath(import.meta.url));
const frontend = path.resolve(scratch, '../..');
const translationRoot = path.resolve(frontend, '../internal/web/translation');
const metadata = JSON.parse(await readFile(path.join(frontend, 'src/paraglide/client-locale-split.json'), 'utf8'));
const sourceFiles = (await readdir(translationRoot)).filter((file) => file.endsWith('.json')).sort();
const resources = Object.create(null);
const flatByLocale = new Map();

function flatten(value, prefix = '', result = Object.create(null)) {
  for (const [key, child] of Object.entries(value)) {
    if (key === '$schema') continue;
    const id = prefix ? `${prefix}.${key}` : key;
    if (child && typeof child === 'object' && !Array.isArray(child)) flatten(child, id, result);
    else if (typeof child === 'string') result[id] = child;
    else throw new Error(`Non-string source leaf at ${id}`);
  }
  return result;
}

for (const file of sourceFiles) {
  const locale = file.slice(0, -5);
  const json = JSON.parse(await readFile(path.join(translationRoot, file), 'utf8'));
  const flat = flatten(json);
  flatByLocale.set(locale, flat);
  resources[locale] = { translation: json };
}

const localeOrder = [...flatByLocale.keys()].sort();
if (JSON.stringify(metadata.locales.slice().sort()) !== JSON.stringify(localeOrder)) {
  throw new Error(`Locale inventory mismatch: ${metadata.locales.join(',')} != ${localeOrder.join(',')}`);
}
const referenceIds = Object.keys(flatByLocale.get('en-US')).sort();
if (referenceIds.length !== 2589 || metadata.messages.length !== referenceIds.length) {
  throw new Error(`Expected 2,589 message bundles; source=${referenceIds.length}, compiler=${metadata.messages.length}`);
}
for (const locale of localeOrder) {
  const ids = Object.keys(flatByLocale.get(locale)).sort();
  if (JSON.stringify(ids) !== JSON.stringify(referenceIds)) {
    throw new Error(`Key inventory differs in ${locale}`);
  }
}

await i18next.init({
  lng: 'en-US',
  fallbackLng: 'en-US',
  resources,
  interpolation: { escapeValue: false, prefix: '{', suffix: '}' },
  returnNull: false,
});

const generated = await import(pathToFileURL(path.join(frontend, 'src/paraglide/messages.js')).href);
const messages = generated.m;
const metaByName = new Map(metadata.messages.map((item) => [item.publicName, item]));
const mismatchExamples = [];
let compared = 0;
let interpolationCases = 0;
let rawMismatches = 0;
let lineEndingOnlyDifferences = 0;

function placeholdersFor(id) {
  const names = new Set();
  for (const locale of localeOrder) {
    const text = flatByLocale.get(locale)[id];
    for (const match of text.matchAll(/(?<!\{)\{([A-Za-z_$][\w$]*)\}(?!\})/g)) names.add(match[1]);
  }
  return [...names];
}

function inputsFor(names, valueFor) {
  return Object.fromEntries(names.map((name) => [name, valueFor(name)]));
}

const cases = [
  ['sample', (name) => `probe_${name}`],
  ['brace-text', () => '{0}/{{literal}}/undefined/null'],
  ['zero', () => 0],
  ['undefined', () => undefined],
  ['null', () => null],
];

for (const id of referenceIds) {
  const fn = messages[id];
  if (typeof fn !== 'function') throw new Error(`Missing generated message export: ${id}`);
  if (!metaByName.has(id)) throw new Error(`Missing compiler metadata: ${id}`);
  const names = placeholdersFor(id);
  for (const locale of localeOrder) {
    const expected = flatByLocale.get(locale)[id];
    const valuesToCheck = names.length ? cases : [['plain', () => undefined]];
    for (const [caseName, valueFor] of valuesToCheck) {
      const inputs = inputsFor(names, valueFor);
      const native = i18next.t(id, { lng: locale, ...inputs });
      const compiledInputs = Object.fromEntries(
        Object.entries(inputs).map(([name, value]) => [name, value == null ? '' : value]),
      );
      const compiled = fn(compiledInputs, { locale });
      compared += 1;
      if (names.length) interpolationCases += 1;
      if (native !== compiled) {
        rawMismatches += 1;
        if (native.replace(/\r\n?/g, '\n') === compiled.replace(/\r\n?/g, '\n')) {
          lineEndingOnlyDifferences += 1;
        } else if (mismatchExamples.length < 30) {
          mismatchExamples.push({ id, locale, caseName, names, expected, native, compiled, inputs });
        }
      }
    }
  }
}

console.log(JSON.stringify({
  locales: localeOrder.length,
  keysPerLocale: referenceIds.length,
  compiledBundles: metadata.messages.length,
  compared,
  interpolationComparisons: interpolationCases,
  inputMessages: metadata.messages.filter((item) => item.hasInputs).length,
  markupMessages: metadata.messages.filter((item) => item.hasMarkup).length,
  rawMismatches,
  lineEndingOnlyDifferences,
  mismatches: mismatchExamples.length,
  examples: mismatchExamples,
}, null, 2));
if (mismatchExamples.length) process.exitCode = 1;
