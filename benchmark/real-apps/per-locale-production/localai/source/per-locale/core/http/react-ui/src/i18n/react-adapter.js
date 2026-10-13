import { useEffect, useMemo, useState } from 'react'
import i18n, { ensureNamespaces, getTranslationFunction, selectedLocale } from './index.js'
import { Trans } from './paraglide-trans.jsx'

function normalizeNamespaces(value) {
  if (Array.isArray(value)) return value.filter((item) => typeof item === 'string')
  if (typeof value === 'string') return [value]
  return []
}

export function useTranslation(namespace, options = {}) {
  const requested = normalizeNamespaces(namespace)
  const namespaces = requested.length ? requested : [i18n.options.defaultNS]
  const namespaceKey = namespaces.join('\u0000')
  const ready = namespaces.every((name) => i18n.hasLoadedNamespace(name))
  const [, setLoadVersion] = useState(0)

  useEffect(() => {
    if (ready) return undefined
    let active = true
    ensureNamespaces(namespaces).then(
      () => active && setLoadVersion((version) => version + 1),
      () => active && setLoadVersion((version) => version + 1),
    )
    return () => { active = false }
    // The normalized namespace string keeps array literals stable between renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [namespaceKey, ready])

  if (!ready && options.useSuspense !== false) throw ensureNamespaces(namespaces)

  const t = useMemo(
    () => getTranslationFunction(namespaces, options.keyPrefix),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [namespaceKey, options.keyPrefix, selectedLocale],
  )

  return { t, i18n, ready }
}

export { Trans }
