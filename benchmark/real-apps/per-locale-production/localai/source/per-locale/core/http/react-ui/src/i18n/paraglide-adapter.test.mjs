import assert from 'node:assert/strict'
import test from 'node:test'
import i18next from 'i18next'
import { createParaglideAdapter, installParaglideAdapter } from './paraglide-adapter.js'

const authNamespace = {
  messages: {
    'login.email': () => 'Correo electrónico',
    'login.toInstance': (inputs) => `Para ${inputs.p0}`,
    'account.greeting': (inputs) => `Hola ${inputs.p0}`,
    'login.slashHint': () => 'Use <1>/</1> to search',
    'item_male_one': (inputs) => `${inputs.p0} autor`,
    'item_female_one': (inputs) => `${inputs.p0} autora`,
  },
  shape: {
    tree: {
      login: {
        email: { $message: 'login.email' },
        slashHint: { $message: 'login.slashHint' },
      },
      library: {
        item_one: { $message: 'items_one' },
        item_other: { $message: 'items_other' },
      },
      form: {
        fields: [
          { $message: 'login.email' },
          7,
          { hint: { $message: 'login.toInstance' } },
        ],
      },
    },
    leaves: {
      'login.email': { inputs: [] },
      'item_male_one': { inputs: [{ slot: 'p0', name: 'count' }] },
      'item_female_one': { inputs: [{ slot: 'p0', name: 'count' }] },
      'login.slashHint': { inputs: [] },
    },
  },
  fallbackShape: {
    tree: {
      login: { toInstance: { $message: 'login.toInstance' } },
      account: { greeting: { $message: 'account.greeting' } },
    },
    leaves: {
      'login.toInstance': { inputs: [{ slot: 'p0', name: 'name' }] },
      'account.greeting': { inputs: [{ slot: 'p0', name: 'name' }] },
    },
  },
}

const libraryNamespace = {
  messages: {
    item_one: (inputs) => `${inputs.p0} elemento`,
    item_other: (inputs) => `${inputs.p0} elementos`,
  },
  shape: {
    tree: {
      item_one: { $message: 'item_one' },
      item_other: { $message: 'item_other' },
    },
    leaves: {
      item_one: { inputs: [{ slot: 'p0', name: 'count' }] },
      item_other: { inputs: [{ slot: 'p0', name: 'count' }] },
    },
  },
}

const pluralResolver = {
  getSuffix(locale, count) {
    assert.equal(locale, 'es')
    return count === 1 ? '_one' : '_other'
  },
}

function setup() {
  let loads = 0
  const adapter = createParaglideAdapter({
    locale: 'es',
    pluralResolver,
    namespaceLoaders: {
      auth: async () => {
        loads += 1
        return authNamespace
      },
      library: async () => libraryNamespace,
    },
  })
  return { ...adapter, loadCount: () => loads }
}

test('backend loads each generated namespace once and marks it ready', async () => {
  const adapter = setup()
  const read = () => new Promise((resolve, reject) => {
    adapter.backend.read('es', 'auth', (error, resources) => error ? reject(error) : resolve(resources))
  })
  const [first, second] = await Promise.all([read(), read()])
  assert.deepEqual(first, {})
  assert.deepEqual(second, {})
  assert.equal(adapter.loadCount(), 1)
  assert.equal(adapter.namespaces.has('auth'), true)
})

test('missing optional namespaces resolve empty and keep key/default fallbacks', async () => {
  const adapter = setup()
  await adapter.loadNamespace('studio')
  assert.equal(adapter.namespaces.has('studio'), true)
  const t = adapter.getFixedT('es', 'studio')
  assert.equal(t('workspace.missing'), 'workspace.missing')
  assert.equal(t('auth:workspace.missing'), 'workspace.missing')
  assert.equal(t('workspace.missing', { defaultValue: 'No workspace' }), 'No workspace')
  assert.equal(adapter.getFixedT('es', 'studio', 'scope')('workspace.missing'), 'scope.workspace.missing')
  assert.equal(adapter.getFixedT('es', 'studio', 'scope')('auth:workspace.missing'), 'workspace.missing')
  assert.equal(t(['auth:first', 'studio:last']), 'last')
})

test('i18next backend readiness and React translation entry points use the adapter', async () => {
  const adapter = setup()
  const instance = i18next.createInstance()
  await instance
    .use(adapter.backend)
    .init({
      lng: 'es',
      fallbackLng: false,
      ns: ['auth'],
      defaultNS: 'auth',
      initAsync: false,
      react: { useSuspense: true },
    })

  installParaglideAdapter(instance, adapter)
  assert.equal(instance.hasLoadedNamespace('auth'), true)
  assert.equal(instance.getFixedT('es', 'auth')('login.email'), 'Correo electrónico')
  assert.equal(instance.t('auth:login.email'), 'Correo electrónico')
})

test('fixed namespace, namespace-qualified keys, key prefixes, and interpolation work', async () => {
  const adapter = setup()
  await adapter.loadNamespace('auth')

  assert.equal(adapter.getFixedT('es', 'auth')('login.email'), 'Correo electrónico')
  assert.equal(adapter.getFixedT('es', 'auth')('auth:login.email'), 'Correo electrónico')
  assert.equal(adapter.getFixedT('es', 'auth', 'login')('email'), 'Correo electrónico')
  assert.equal(adapter.getFixedT('es', 'auth')('login.toInstance', { name: 'LocalAI' }), 'Para LocalAI')
})

test('plural and context variants use i18next plural rules and compiled inputs', async () => {
  const adapter = setup()
  await Promise.all([adapter.loadNamespace('auth'), adapter.loadNamespace('library')])
  const t = adapter.getFixedT('es', ['auth', 'library'])

  assert.equal(t('library:item', { count: 1 }), '1 elemento')
  assert.equal(t('library:item', { count: 4 }), '4 elementos')
  assert.equal(t('item', { count: 1, context: 'male' }), '1 autor')
  assert.equal(t('item', { count: 1, context: 'female' }), '1 autora')
})

test('plural lookup follows i18next zero, context, and ordinal fallback order', async () => {
  const adapter = createParaglideAdapter({
    locale: 'es',
    pluralResolver: {
      getSuffix(_locale, count, options) {
        if (options.ordinal) return count === 2 ? '_ordinal_two' : '_ordinal_other'
        return count === 1 ? '_one' : '_other'
      },
    },
    namespaceLoaders: {
      auth: async () => ({
        messages: {
          zero_other: () => 'other',
          zero_zero: () => 'zero',
          context_male: () => 'context',
          context_male_one: () => 'context plural',
          ordinal_two: () => 'cardinal fallback',
          ordinal_ordinal_two: () => 'ordinal',
        },
        shape: { tree: {}, leaves: {} },
      }),
    },
  })
  await adapter.loadNamespace('auth')
  const t = adapter.getFixedT('es', 'auth')

  assert.equal(t('zero', { count: 0 }), 'other')
  assert.equal(t('context', { context: 'male', count: 1 }), 'context')
  assert.equal(t('ordinal', { count: 2, ordinal: true }), 'cardinal fallback')
})

test('returnObjects preserves nested object, array, and primitive leaf shape', async () => {
  const adapter = setup()
  await adapter.loadNamespace('auth')
  const returned = adapter.getFixedT('es', 'auth')('form', {
    returnObjects: true,
    name: 'LocalAI',
  })

  assert.deepEqual(returned, {
    fields: ['Correo electrónico', 7, { hint: 'Para LocalAI' }],
  })
})

test('base-locale metadata supplies inputs for fallback messages and object shapes', async () => {
  const adapter = setup()
  await adapter.loadNamespace('auth')
  const t = adapter.getFixedT('es', 'auth')

  assert.equal(t('login.toInstance', { name: 'LocalAI' }), 'Para LocalAI')
  assert.deepEqual(t('account', { returnObjects: true, name: 'LocalAI' }), {
    greeting: 'Hola LocalAI',
  })
})

test('missing messages use defaultValue, key-array fallback, and literal rich text', async () => {
  const adapter = setup()
  await adapter.loadNamespace('auth')
  const t = adapter.getFixedT('es', 'auth')

  assert.equal(t('not.present', { defaultValue: 'Unavailable' }), 'Unavailable')
  assert.equal(t(['not.present', 'login.email']), 'Correo electrónico')
  assert.equal(t('login.slashHint'), 'Use <1>/</1> to search')
})

test('locale changes use the specialized-build navigation callback', async () => {
  const adapter = setup()
  const originalWindow = globalThis.window
  const originalDocument = globalThis.document
  let reloads = 0
  globalThis.window = { location: { reload: () => { reloads += 1 } } }
  globalThis.document = { cookie: '' }
  try {
    const instance = {
      language: 'es',
      options: { defaultNS: 'auth' },
      changeLanguage() {
        throw new Error('specialized locale changes must not mutate the current graph')
      },
    }
    installParaglideAdapter(instance, adapter, {
      onLocaleChange(language, callback) {
        globalThis.window.localStorage?.setItem('localai-language', language)
        globalThis.document.cookie = `localai-language=${language}; Path=/`
        callback?.(null)
        globalThis.window.location.reload()
        return Promise.resolve(language)
      },
    })

    let callbackError = 'not called'
    assert.equal(await instance.changeLanguage('pt-BR', (error) => { callbackError = error }), 'pt-BR')
    assert.equal(callbackError, null)
    assert.equal(globalThis.document.cookie, 'localai-language=pt-BR; Path=/')
    assert.equal(reloads, 1)
  } finally {
    if (originalWindow === undefined) delete globalThis.window
    else globalThis.window = originalWindow
    if (originalDocument === undefined) delete globalThis.document
    else globalThis.document = originalDocument
  }
})
