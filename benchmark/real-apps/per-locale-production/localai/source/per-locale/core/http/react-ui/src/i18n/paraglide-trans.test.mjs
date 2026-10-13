import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import i18next from 'i18next'
import { Trans as NativeTrans } from 'react-i18next'

// This .jsx contains ordinary JS/createElement. Load that exact source in Node,
// replacing only Vite runtime imports; test rendering uses the real React engine.
const require = createRequire(import.meta.url)
const runtimeStub = 'data:text/javascript,' + encodeURIComponent('export default {}; export const ensureNamespaces = () => Promise.resolve();')
const source = (await readFile(new URL('./paraglide-trans.jsx', import.meta.url), 'utf8'))
  .replace("from 'react'", `from ${JSON.stringify(pathToFileURL(require.resolve('react')).href)}`)
  .replace("from './index.js'", `from ${JSON.stringify(runtimeStub)}`)
const { Trans, renderTransContent } = await import('data:text/javascript,' + encodeURIComponent(source))
const render = (Component, props) => renderToStaticMarkup(h(Component, props))
async function engine(resources, lng = 'en') {
  const instance = i18next.createInstance()
  await instance.init({ lng, fallbackLng: 'en', resources, ns: ['home', 'agents'], defaultNS: 'home', interpolation: { escapeValue: false } })
  return instance
}

for (const locale of ['en', 'de', 'es', 'id', 'it', 'ko', 'pt-BR', 'zh-CN']) {
  test(`actual LocalAI ${locale} named kbd and numeric Link preserve native output`, async () => {
    const resources = {}
    for (const language of new Set(['en', locale])) {
      resources[language] = {}
      for (const namespace of ['home', 'agents']) resources[language][namespace] = JSON.parse(await readFile(new URL(`../../public/locales/${language}/${namespace}.json`, import.meta.url), 'utf8'))
    }
    const runtime = await engine(resources, locale)
    const cases = [
      { i18n: runtime, i18nKey: 'input.slashHint', t: runtime.getFixedT(locale, 'home'), components: { kbd: h('kbd', { className: 'dk-kbd' }) } },
      { i18n: runtime, i18nKey: 'agents:empty.browseHub', values: {}, components: { 1: h('a', { href: 'https://example.test/hub', target: '_blank', rel: 'noopener noreferrer' }) } },
    ]
    for (const props of cases) assert.equal(render(Trans, props), render(NativeTrans, props))
  })
}

test('explicit interpolation containing known tags, unknown tags, ampersands matches native boundary', async () => {
  const runtime = await engine({ en: { home: { hint: 'Use <kbd>{{value}}</kbd> and {{other}}' } } })
  const props = { i18n: runtime, i18nKey: 'hint', values: { value: '<kbd>value</kbd>', other: '<img src="x"/> & "quoted" < 3' }, components: { kbd: h('kbd', { className: 'safe' }) } }
  assert.equal(render(Trans, props), render(NativeTrans, props))
  assert.ok(!render(Trans, props).includes('<img'))
})

test('translation attributes override component attributes while preserving remaining props and handlers', async () => {
  const runtime = await engine({ en: { agents: { link: '<1 href="/translated">Link <strong>label</strong></1>' } } })
  const onClick = () => {}
  const component = h('a', { href: '/original', rel: 'noopener', onClick, 'data-test': 'link' })
  const props = { i18n: runtime, i18nKey: 'agents:link', components: { 1: component } }
  assert.equal(render(Trans, props), render(NativeTrans, props))
  const [result] = renderTransContent('<1 href="/translated">Link</1>', { components: { 1: component } })
  assert.equal(result.props.onClick, onClick)
  assert.equal(result.props.rel, 'noopener')
  assert.equal(result.props.href, '/translated')
})

test('self closing component keeps supplied children; default children, parent, count and entities match native', async () => {
  const runtime = await engine({ en: { home: { empty: 'Before <0/> after', count_one: '{{count}} <kbd>item</kbd>', count_other: '{{count}} <kbd>items</kbd>', entities: '<kbd>&lt;/&gt; &amp;</kbd>' } } })
  const cases = [
    { i18n: runtime, i18nKey: 'empty', components: [h('span', { className: 'kept' }, 'Original child')] },
    { i18n: runtime, i18nKey: 'missing', defaults: 'Use <kbd>/</kbd>', components: { kbd: h('kbd') }, parent: 'p', className: 'parent' },
    { i18n: runtime, i18nKey: 'count', count: 2, components: { kbd: h('kbd') } },
    { i18n: runtime, i18nKey: 'entities', shouldUnescape: true, components: { kbd: h('kbd') } },
    { i18n: runtime, i18nKey: 'absent-child-key', children: ['Hello ', h('strong', null, 'friend')] },
  ]
  for (const props of cases) assert.equal(render(Trans, props), render(NativeTrans, props))
})
