import assert from 'node:assert/strict'
import test from 'node:test'
import { createFixedLocaleRuntime } from './fixed-locale-runtime.js'

function makeRuntime(overrides = {}) {
  let loads = 0
  const runtime = createFixedLocaleRuntime({
    locale: 'es',
    locales: ['en', 'es'],
    namespaceLoaders: {
      auth: async () => {
        loads += 1
        return {
          messages: {
            'login.email': () => 'Correo electrónico',
            'login.toInstance': (inputs) => `Para ${inputs.p0}`,
          },
          shape: {
            tree: {
              login: {
                email: { $message: 'login.email' },
                toInstance: { $message: 'login.toInstance' },
              },
            },
            leaves: {
              'login.email': { inputs: [] },
              'login.toInstance': { inputs: [{ slot: 'p0', name: 'name' }] },
            },
          },
        }
      },
      ...overrides.namespaceLoaders,
    },
  })
  return { runtime, loadCount: () => loads }
}

test('fixed runtime shares lazy loads and resolves compiled namespace functions', async () => {
  const { runtime, loadCount } = makeRuntime()
  assert.equal(runtime.language, 'es')
  assert.equal(runtime.resolvedLanguage, 'es')
  assert.equal(runtime.hasLoadedNamespace('auth'), false)

  await Promise.all([runtime.loadNamespace('auth'), runtime.loadNamespaces(['auth'])])
  assert.equal(loadCount(), 1)
  assert.equal(runtime.hasLoadedNamespace('auth'), true)
  assert.equal(runtime.getFixedT('es', 'auth')('login.email'), 'Correo electrónico')
  assert.equal(runtime.getFixedT('es', 'auth')('login.toInstance', { name: 'LocalAI' }), 'Para LocalAI')
})

test('fixed locale navigation writes both selectors and reloads once', async () => {
  const { runtime } = makeRuntime()
  const originalWindow = globalThis.window
  const originalDocument = globalThis.document
  let reloads = 0
  globalThis.window = {
    localStorage: { setItem(key, value) { this[key] = value } },
    location: { reload() { reloads += 1 } },
  }
  globalThis.document = { cookie: '' }
  try {
    let callbackError = 'not-called'
    await runtime.changeLanguage('en', (error) => { callbackError = error })
    assert.equal(callbackError, null)
    assert.equal(window.localStorage['localai-language'], 'en')
    assert.equal(document.cookie, 'localai-language=en; Path=/; SameSite=Lax')
    assert.equal(reloads, 1)
    await assert.rejects(runtime.changeLanguage('fr'), /Unsupported LocalAI locale: fr/)
    assert.equal(reloads, 1)
  } finally {
    if (originalWindow === undefined) delete globalThis.window
    else globalThis.window = originalWindow
    if (originalDocument === undefined) delete globalThis.document
    else globalThis.document = originalDocument
  }
})
