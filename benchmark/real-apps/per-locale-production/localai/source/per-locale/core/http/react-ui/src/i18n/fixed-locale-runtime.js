import { createParaglideAdapter } from './paraglide-adapter.js'

function asNamespaceList(value, fallback) {
  const namespaces = Array.isArray(value)
    ? value.filter((item) => typeof item === 'string')
    : typeof value === 'string'
      ? [value]
      : []
  return namespaces.length ? namespaces : [fallback]
}

function getPluralSuffix(locale, count, options = {}) {
  const category = new Intl.PluralRules(locale, {
    type: options.ordinal ? 'ordinal' : 'cardinal',
  }).select(count)
  return options.ordinal ? `_ordinal_${category}` : `_${category}`
}

/** Create the small fixed-locale surface used by LocalAI's React UI. */
export function createFixedLocaleRuntime({ locale, locales, namespaceLoaders, defaultNamespace = 'common' }) {
  const adapter = createParaglideAdapter({
    locale,
    namespaceLoaders,
    pluralResolver: { getSuffix: getPluralSuffix },
  })
  const listeners = new Map()
  const emit = (eventName, ...args) => {
    for (const listener of listeners.get(eventName) || []) listener(...args)
  }

  const i18n = {
    language: locale,
    resolvedLanguage: locale,
    isInitialized: true,
    options: { defaultNS: defaultNamespace },
    getFixedT: adapter.getFixedT,
    t: adapter.getFixedT(locale, defaultNamespace),

    loadNamespace(namespace) {
      return adapter.loadNamespace(namespace)
    },

    loadNamespaces(namespaces) {
      return Promise.all(asNamespaceList(namespaces, defaultNamespace).map((namespace) => adapter.loadNamespace(namespace)))
        .then(() => i18n)
    },

    hasLoadedNamespace(namespace) {
      return adapter.namespaces.has(namespace)
    },

    changeLanguage(language, callback) {
      return changeLanguage(language, callback)
    },

    on(eventName, listener) {
      const eventListeners = listeners.get(eventName) || new Set()
      eventListeners.add(listener)
      listeners.set(eventName, eventListeners)
      return i18n
    },

    off(eventName, listener) {
      listeners.get(eventName)?.delete(listener)
      return i18n
    },
  }

  const changeLanguage = (language, callback) => {
    if (language === locale) {
      callback?.(null, i18n.t)
      return Promise.resolve(i18n)
    }
    if (!locales.includes(language)) {
      const error = new Error(`Unsupported LocalAI locale: ${language}`)
      callback?.(error)
      return Promise.reject(error)
    }

    try {
      window.localStorage.setItem('localai-language', language)
    } catch {
      // The server cookie remains the selector when storage is blocked.
    }
    document.cookie = `localai-language=${encodeURIComponent(language)}; Path=/; SameSite=Lax`
    callback?.(null, i18n.t)
    emit('languageChanged', language)
    window.location.reload()
    return Promise.resolve(i18n)
  }

  return i18n
}
