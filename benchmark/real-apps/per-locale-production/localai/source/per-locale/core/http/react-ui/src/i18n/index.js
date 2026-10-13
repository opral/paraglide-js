import { getLocale, locales } from '../paraglide/runtime.js'
import { createFixedLocaleRuntime } from './fixed-locale-runtime.js'

const languageDetails = {
  en: { name: 'English', flag: 'EN' },
  it: { name: 'Italiano', flag: 'IT' },
  es: { name: 'Español', flag: 'ES' },
  de: { name: 'Deutsch', flag: 'DE' },
  'zh-CN': { name: '简体中文', flag: 'ZH' },
  id: { name: 'Bahasa Indonesia', flag: 'ID' },
  ko: { name: '한국어', flag: 'KO' },
  'pt-BR': { name: 'Português (Brasil)', flag: 'BR' },
}

const preferredOrder = ['en', 'it', 'es', 'de', 'zh-CN', 'id', 'ko', 'pt-BR']
export const SUPPORTED_LANGUAGES = preferredOrder
  .filter((code) => locales.includes(code))
  .map((code) => ({ code, ...languageDetails[code] }))

export const selectedLocale = getLocale()

const namespaceModules = import.meta.glob('../paraglide/namespaces/*.js')
const compiledNamespaces = Object.keys(namespaceModules).map((path) =>
  path.slice(path.lastIndexOf('/') + 1, -3),
)
// These two native namespaces have no catalog files. i18next treats their
// backend 404 as an empty namespace, so preserve that key/default fallback.
export const NAMESPACES = [...new Set([...compiledNamespaces, 'studio', 'usage'])]
const namespaceShapes = import.meta.glob('./generated-shapes/*/*.json')
const namespaceLoaders = Object.fromEntries(
  NAMESPACES.map((namespace) => {
    const messagePath = `../paraglide/namespaces/${namespace}.js`
    const shapePath = `./generated-shapes/${selectedLocale}/${namespace}.json`
    const loadMessages = namespaceModules[messagePath]
    const loadShape = namespaceShapes[shapePath]

    if (!loadMessages && !loadShape) {
      return [namespace, async () => ({ messages: {}, shape: { tree: {}, leaves: {} } })]
    }
    if (typeof loadMessages !== 'function' || typeof loadShape !== 'function') {
      throw new Error(`Missing generated Paraglide namespace assets for ${selectedLocale}/${namespace}`)
    }

    return [namespace, async () => {
      const [messages, shape] = await Promise.all([loadMessages(), loadShape()])
      return { messages, shape }
    }]
  }),
)

const i18n = createFixedLocaleRuntime({
  locale: selectedLocale,
  locales,
  namespaceLoaders,
})

i18n.on('languageChanged', (language) => {
  document.documentElement.setAttribute('lang', language)
})
document.documentElement.setAttribute('lang', selectedLocale)

export function ensureNamespaces(namespaces) {
  return i18n.loadNamespaces(namespaces)
}

export function getTranslationFunction(namespaces, keyPrefix) {
  return i18n.getFixedT(selectedLocale, namespaces, keyPrefix)
}

// Match the native i18next startup set. Other namespaces remain lazy and are
// loaded by the Suspense hook when their route or component is first rendered.
export const startupNamespaces = ensureNamespaces(['common', 'nav', 'errors'])

export default i18n
