import HTML from 'html-parse-stringify'
import { Children, Fragment, cloneElement, createElement, isValidElement } from 'react'
import defaultI18n, { ensureNamespaces } from './index.js'

// LocalAI's declared <kbd> and numbered <1> components use the same native
// Trans text/React boundary. No DOM/HTML injection or i18next engine is needed.
const BASIC = new Set(['br', 'strong', 'i', 'p'])
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr'])
const ENTITIES = { amp: '&', lt: '<', gt: '>', apos: "'", quot: '"', nbsp: ' ', copy: '©', reg: '®', hellip: '…', '#38': '&', '#60': '<', '#62': '>', '#39': "'", '#34': '"', '#160': ' ', '#169': '©', '#174': '®', '#8230': '…', '#x2F': '/', '#47': '/' }
const unescapeText = text => text.replace(/&([^;]+);/g, (original, name) => ENTITIES[name] ?? original)
const asArray = value => value === undefined || value === null ? [] : Array.isArray(value) ? value : [value]

function childTemplate(children, values) {
  return asArray(children).map((child, index) => {
    if (typeof child === 'string') return child
    if (isValidElement(child)) {
      const contents = childTemplate(child.props.children, values)
      const keepName = BASIC.has(child.type) && Object.keys(child.props).length <= (child.props.children === undefined ? 0 : 1)
      const name = keepName ? child.type : index
      return VOID.has(name) ? `<${name}/>` : `<${name}>${contents}</${name}>`
    }
    if (child && typeof child === 'object') {
      const names = Object.keys(child).filter(name => name !== 'format')
      if (names.length === 1) {
        values[names[0]] = child[names[0]]
        return `{{${names[0]}}}`
      }
    }
    return ''
  }).join('')
}

function tokenize(text) {
  const map=node=>node.type==='text'?{type:'text',value:node.content}:{...node,children:(node.children||[]).map(map)}
  const wrapper=HTML.parse(`<0>${text}</0>`)[0]
  return (wrapper?.children||[]).map(map)
}

export function renderTransContent(translation, { components = {}, children, shouldUnescape = false, textReplacements = {} } = {}) {
  if (translation === '') return []
  const componentMap = Array.isArray(components) ? Object.fromEntries(components.map((component, index) => [index, component])) : components || {}
  const indexedChildren = asArray(children)
  const replaceText = text => {
    for (const [token, value] of Object.entries(textReplacements)) text = text.split(token).join(String(value))
    return shouldUnescape ? unescapeText(text) : text
  }
  // Native Trans skips markup parsing when no components/children/basic tags exist.
  if (!children && Object.keys(componentMap).length === 0 && !/<(?:br|strong|i|p)(?:\s|\/?>)/.test(translation) && !shouldUnescape) return [translation]
  const render = (nodes, scope = indexedChildren) => nodes.flatMap((node, index) => {
    if (node.type === 'text') return [replaceText(node.value)]
    const supplied = Object.hasOwn(componentMap, node.name) ? componentMap[node.name] : /^\d+$/.test(node.name) ? scope[Number(node.name)] : undefined
    const inner = render(node.children, isValidElement(supplied) ? asArray(supplied.props.children) : scope)
    if (isValidElement(supplied)) {
      const attrs = Object.fromEntries(Object.entries(node.attrs).map(([name, value]) => [name, shouldUnescape ? unescapeText(value) : value]))
      const props = { ...attrs, key: supplied.key ?? index }
      if (node.voidElement && supplied.props.children !== undefined) return [cloneElement(supplied, props)]
      return [cloneElement(supplied, props, node.voidElement ? undefined : inner)]
    }
    if (typeof supplied === 'string') return [replaceText(supplied)]
    if (BASIC.has(node.name)) return [createElement(node.name, { key: `${node.name}-${index}` }, node.voidElement ? undefined : inner)]
    if (/^\d+$/.test(node.name)) return inner
    // Native Trans serializes unknown HTML names as literal tags, dropping attributes.
    return node.voidElement ? [`<${node.name} />`] : [`<${node.name}>`, ...inner, `</${node.name}>`]
  })
  return render(tokenize(String(translation), componentMap))
}

export function Trans({ children, count, parent, i18nKey, context, tOptions = {}, values, defaults, components, ns, i18n: overrideI18n, t: suppliedT, shouldUnescape, ...parentProps }) {
  const runtime = overrideI18n || defaultI18n
  const namespaces = ns || suppliedT?.ns || runtime.options?.defaultNS || 'translation'
  const qualifiedNamespace = typeof i18nKey === 'string' && i18nKey.includes(':') ? i18nKey.split(':', 1)[0] : undefined
  const needed = qualifiedNamespace ? [qualifiedNamespace] : asArray(namespaces)
  if (runtime.hasLoadedNamespace && needed.some(namespace => !runtime.hasLoadedNamespace(namespace))) {
    const pending = runtime === defaultI18n ? ensureNamespaces(needed) : runtime.loadNamespaces(needed)
    throw pending
  }
  const childValues = {}
  const template = childTemplate(children, childValues)
  const defaultValue = defaults || tOptions.defaultValue || template || i18nKey
  const key = i18nKey || defaultValue
  const t = suppliedT || runtime.getFixedT(runtime.language, namespaces)
  const replacements = {}
  const interpolationValues = { ...childValues, ...values }
  // Children interpolation occurs after native Trans parses tags. Keep values
  // opaque through the compiler call, then restore them only in React text.
  if (values === undefined && count === undefined && children) {
    let prefix = '\uE000localai-trans-'
    while (String(defaultValue).includes(prefix) || Object.values(childValues).some(value => String(value).includes(prefix))) prefix += '-'
    Object.entries(childValues).forEach(([name, value], index) => {
      const token = `${prefix}${index}\uE001`
      replacements[token] = value
      interpolationValues[name] = token
    })
  }
  let translation = t(key, { ...tOptions, ...interpolationValues, ...(count === undefined ? {} : { count }), ...(context === undefined ? {} : { context }), defaultValue, ns: namespaces })
  if (translation === key && defaultValue) translation = defaultValue
  const content = renderTransContent(String(translation ?? ''), { components, children, shouldUnescape, textReplacements: replacements })
  return parent ? createElement(parent, parentProps, ...content) : createElement(Fragment, null, ...content)
}
