const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key)

const normalizeNamespaceList = (value) => {
  if (Array.isArray(value)) return value.filter((item) => typeof item === 'string')
  if (typeof value === 'string') return [value]
  return []
}

function splitQualifiedKey(key, nsSeparator) {
  if (typeof key !== 'string' || !nsSeparator) return { ns: null, key }
  const separatorIndex = key.indexOf(nsSeparator)
  if (separatorIndex < 0) return { ns: null, key }
  return {
    ns: key.slice(0, separatorIndex),
    key: key.slice(separatorIndex + nsSeparator.length),
  }
}

function getAtPath(tree, path, separator) {
  if (!separator || !path.includes(separator)) return hasOwn(tree, path) ? tree[path] : undefined
  let current = tree
  for (const segment of path.split(separator)) {
    if (!current || typeof current !== 'object' || !hasOwn(current, segment)) return undefined
    current = current[segment]
  }
  return current
}

function getMessageCandidates(
  key,
  options,
  locale,
  pluralResolver,
  pluralSeparator,
  contextSeparator,
) {
  const hasContext = options.context !== undefined && options.context !== '' &&
    (typeof options.context === 'string' || typeof options.context === 'number')
  const contextKey = hasContext ? `${key}${contextSeparator}${options.context}` : undefined
  const hasCount = options.count !== undefined && typeof options.count !== 'string'
  const plural = hasCount && pluralResolver
    ? pluralResolver.getSuffix(locale, options.count, options)
    : ''
  const zero = hasCount && !options.ordinal && options.count === 0
    ? `${pluralSeparator}zero`
    : ''
  const result = [key]
  if (plural) {
    if (options.ordinal && plural.startsWith(`${pluralSeparator}ordinal${pluralSeparator}`)) {
      result.push(`${key}${plural.replace(`${pluralSeparator}ordinal${pluralSeparator}`, pluralSeparator)}`)
    }
    result.push(`${key}${plural}`)
  }
  if (zero) result.push(`${key}${zero}`)
  if (contextKey) {
    result.push(contextKey)
    if (plural) {
      if (options.ordinal && plural.startsWith(`${pluralSeparator}ordinal${pluralSeparator}`)) {
        result.push(`${contextKey}${plural.replace(`${pluralSeparator}ordinal${pluralSeparator}`, pluralSeparator)}`)
      }
      result.push(`${contextKey}${plural}`)
    }
    if (zero) result.push(`${contextKey}${zero}`)
  }
  return [...new Set(result)]
}

function buildInputValues(inputs, options) {
  const values = {}
  for (const input of inputs || []) {
    values[input.slot] = options[input.name]
  }
  return values
}

function messageText(namespaceData, key, options) {
  const fn = namespaceData.messages[key]
  if (typeof fn !== 'function') return undefined
  const leaf = namespaceData.shape.leaves?.[key] ?? namespaceData.fallbackShape?.leaves?.[key]
  const inputs = leaf?.inputs || []
  const value = inputs.length > 0 ? fn(buildInputValues(inputs, options)) : fn()
  return value === `${namespaceData.namespace}:${key}` ? undefined : value
}

function materializeShape(value, namespaceData, options, separator) {
  if (Array.isArray(value)) {
    const result = value.map((child) => materializeShape(child, namespaceData, options, separator))
    return options.joinArrays === undefined ? result : result.join(options.joinArrays)
  }
  if (!value || typeof value !== 'object') return value
  if (hasOwn(value, '$message')) {
    const translated = messageText(namespaceData, value.$message, options)
    return translated === undefined ? value.$message : translated
  }
  const result = Object.create(Object.getPrototypeOf(value) === null ? null : Object.prototype)
  for (const key of Object.keys(value)) {
    result[key] = materializeShape(value[key], namespaceData, options, separator)
  }
  return result
}

/**
 * Build the i18next-compatible translation functions used by the fixed-locale
 * app experiment. Namespace imports remain lazy; i18next's backend connector
 * still controls Suspense and namespace readiness.
 */
export function createParaglideAdapter({
  locale,
  namespaceLoaders,
  pluralResolver = () => undefined,
  keySeparator = '.',
  nsSeparator = ':',
  pluralSeparator = '_',
  contextSeparator = '_',
}) {
  const namespaces = new Map()
  const loads = new Map()

  function loadNamespace(namespace) {
    if (namespaces.has(namespace)) return Promise.resolve(namespaces.get(namespace))
    if (loads.has(namespace)) return loads.get(namespace)
    const loader = namespaceLoaders[namespace]
    if (typeof loader !== 'function') {
      // Native i18next's HTTP backend treats an unknown/missing namespace file
      // as an empty resource set, then lets t() use its normal key/default
      // fallback. Keep that behavior instead of rejecting a React Suspense
      // promise for a missing optional namespace.
      const data = {
        namespace,
        messages: Object.create(null),
        shape: { tree: Object.create(null), leaves: Object.create(null) },
        fallbackShape: undefined,
      }
      namespaces.set(namespace, data)
      return Promise.resolve(data)
    }
    const pending = Promise.resolve()
      .then(loader)
      .then((module) => {
        const rawShape = module.shape?.default ?? module.shape
        const shape = rawShape && { ...rawShape, tree: rawShape.tree || {} }
        const fallbackShape = module.fallbackShape?.default ?? module.fallbackShape ?? (
          rawShape?.fallbackTree
            ? { tree: rawShape.fallbackTree, leaves: rawShape.leaves }
            : undefined
        )
        const data = {
          namespace,
          messages: module.messages?.default ?? module.messages,
          shape,
          fallbackShape,
        }
        if (!data.messages || !data.shape?.tree) {
          throw new Error(`Invalid Paraglide namespace module: ${namespace}`)
        }
        namespaces.set(namespace, data)
        return data
      })
      .finally(() => loads.delete(namespace))
    loads.set(namespace, pending)
    return pending
  }

  function translateOne(rawKey, fixedNamespaces, fixedPrefix, options) {
    const { ns: explicitNamespace, key: unqualifiedKey } = splitQualifiedKey(rawKey, nsSeparator)
    const optionNamespaces = normalizeNamespaceList(options.ns)
    const candidateNamespaces = explicitNamespace
      ? [explicitNamespace]
      : optionNamespaces.length > 0
        ? optionNamespaces
        : fixedNamespaces
    const prefix = options.keyPrefix !== undefined ? options.keyPrefix : fixedPrefix
    const key = prefix && !explicitNamespace
      ? `${prefix}${keySeparator}${unqualifiedKey}`
      : unqualifiedKey
    const resolver = typeof pluralResolver === 'function' ? pluralResolver() : pluralResolver

    for (const namespace of candidateNamespaces) {
      const namespaceData = namespaces.get(namespace)
      if (!namespaceData) continue

      if (options.returnObjects) {
        const selectedValue = getAtPath(namespaceData.shape.tree, key, keySeparator)
        const shapedValue = selectedValue === undefined
          ? getAtPath(namespaceData.fallbackShape?.tree || {}, key, keySeparator)
          : selectedValue
        if (shapedValue !== undefined) {
          if (shapedValue && typeof shapedValue === 'object') {
            return { found: true, value: materializeShape(shapedValue, namespaceData, options, keySeparator) }
          }
        }
      }

      for (const candidate of getMessageCandidates(
        key,
        options,
        locale,
        resolver,
        pluralSeparator,
        contextSeparator,
      )) {
        const value = messageText(namespaceData, candidate, options)
        if (value !== undefined) return { found: true, value }
      }
    }

    return { found: false }
  }

  function getFixedT(_lng, ns, keyPrefix) {
    const fixedNamespaces = normalizeNamespaceList(ns)
    const translate = (key, options = {}) => {
      if (typeof options === 'string') options = { defaultValue: options }
      if (!options || typeof options !== 'object') options = {}
      const keys = Array.isArray(key) ? key : [key]
      for (const candidate of keys) {
        const result = translateOne(candidate, fixedNamespaces, keyPrefix, options)
        if (result.found) return result.value
      }
      if (options.defaultValue !== undefined) return options.defaultValue
      const fallbackKey = keys[keys.length - 1]
      const { ns: explicitNamespace, key: unqualifiedKey } = splitQualifiedKey(fallbackKey, nsSeparator)
      const prefix = options.keyPrefix !== undefined ? options.keyPrefix : keyPrefix
      return prefix && !explicitNamespace
        ? `${prefix}${keySeparator}${unqualifiedKey}`
        : unqualifiedKey
    }
    translate.lng = locale
    translate.ns = ns
    translate.keyPrefix = keyPrefix
    return translate
  }

  const backend = {
    type: 'backend',
    init() {},
    read(_language, namespace, callback) {
      loadNamespace(namespace).then(
        () => callback(null, {}),
        (error) => callback(error, false),
      )
    },
  }

  return { backend, getFixedT, loadNamespace, namespaces }
}

export function installParaglideAdapter(i18n, adapter, { onLocaleChange } = {}) {
  const nativeChangeLanguage = i18n.changeLanguage.bind(i18n)
  i18n.getFixedT = adapter.getFixedT
  i18n.t = adapter.getFixedT(i18n.language, i18n.options.defaultNS)
  if (onLocaleChange) {
    i18n.changeLanguage = (language, callback) => {
      if (language === i18n.language) return nativeChangeLanguage(language, callback)
      return onLocaleChange(language, callback)
    }
  }
  return i18n
}
