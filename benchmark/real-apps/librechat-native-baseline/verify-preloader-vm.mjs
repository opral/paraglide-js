import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const htmlPath = process.env.PRELOAD_HTML || './preload-dist/index.html';
const html = fs.readFileSync(htmlPath, 'utf8');
const match = html.match(/<script data-native-locale-preload-control="">([\s\S]*?)<\/script>/);
assert(match, `Could not find inlined preloader in ${htmlPath}`);
const source = match[1];

function select({ cookie = '', stored, language = 'en-US', languages = [language] }) {
  const links = [];
  const document = {
    cookie,
    baseURI: 'https://example.test/',
    createElement(tag) {
      assert.equal(tag, 'link');
      return { setAttribute(name, value) { this[name] = value; } };
    },
    head: { appendChild(link) { links.push(link); } },
  };
  const localStorage = { getItem(key) { assert.equal(key, 'lang'); return stored; } };
  vm.runInNewContext(source, { document, localStorage, navigator: { language, languages }, URL });
  if (!links.length) return null;
  return { locale: links[0]['data-native-locale-preload'], href: links[0].href, rel: links[0].rel };
}

const cases = [
  {
    name: 'cookie alias wins over stored language',
    input: { cookie: 'lang=fr-FR', stored: '"de-DE"' },
    locale: 'fr',
  },
  {
    name: 'JSON localStorage alias',
    input: { stored: '"pt"' },
    locale: 'pt-PT',
  },
  {
    name: 'raw localStorage regional alias',
    input: { stored: 'zh-TW' },
    locale: 'zh-Hant',
  },
  {
    name: 'auto uses browser language',
    input: { cookie: 'lang=auto', stored: '"de"', language: 'es-ES' },
    locale: 'es',
  },
  {
    name: 'navigator regional alias',
    input: { language: 'ar-EG' },
    locale: 'ar',
  },
  {
    name: 'invalid cookie wins and falls back to English',
    input: { cookie: 'lang=zz-ZZ', stored: '"fr-FR"' },
    locale: null,
  },
  {
    name: 'English has no dynamic chunk',
    input: { cookie: 'lang=en-US' },
    locale: null,
  },
];

for (const test of cases) {
  const result = select(test.input);
  assert.equal(result?.locale ?? null, test.locale, test.name);
  if (test.locale) {
    assert.equal(result.rel, 'modulepreload', test.name);
    assert.match(result.href, /\/assets\/locale-[^/]+\.js$/, test.name);
  }
}

console.log(JSON.stringify({
  htmlPath,
  passed: cases.length,
  cases: cases.map(({ name, locale }) => ({ name, selectedLocale: locale })),
  limits: 'VM validates selection/preload only; RTL document direction and rendered UI require browser/app behavior.',
}, null, 2));
