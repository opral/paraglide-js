import { reservedJsKeywords } from "./safe-module-id.js";

/** Generate a native ESM loader without importing the message catalog. */
export function createDynamicFile(): string {
	return `import { getLocale, assertIsLocale } from './runtime.js';

/** @typedef {typeof import('./messages.js').m} MessageFunctions */
/** @typedef {keyof MessageFunctions} MessageKey */
/**
 * @template {MessageKey} K
 * @typedef {keyof NonNullable<Parameters<MessageFunctions[K]>[0]> extends never ? [inputs?: Record<string, never>, options?: Parameters<MessageFunctions[K]>[1]] : Parameters<MessageFunctions[K]>} MessageArgs
 */
/**
 * @template {MessageKey} K
 * @typedef {K extends MessageKey ? [key: K, ...args: MessageArgs<K>] : never} KnownCall
 */
/**
 * @template {string} K
 * @typedef {string extends K ? [key: K, inputs?: Record<string, unknown>, options?: { locale?: import('./runtime.js').Locale }] : K extends MessageKey ? KnownCall<K> : never} MessageCall
 */

export class MessageLoadError extends Error {
  /**
   * @param {string} key
   * @param {import('./runtime.js').Locale} locale
   * @param {unknown} cause
   */
  constructor(key, locale, cause) {
    super('Failed to load message ' + JSON.stringify(key) + ' for ' + locale, { cause });
    this.name = 'MessageLoadError';
    this.key = key;
    this.locale = locale;
  }
}

/**
 * Load and call a message using its original key. Deploy the generated native
 * ES modules together: computed imports do not emit assets in bundler builds.
 * Literal keys check inputs; widened strings accept arbitrary input records.
 * The locale is captured before loading. Formatting errors pass through.
 * @template {string} K
 * @param {MessageCall<K>} args
 * @returns {Promise<import('./runtime.js').LocalizedString>}
 */
export async function getMessage(...args) {
  const [key, inputs, options = {}] = /** @type {[string, Record<string, unknown>?, { locale?: import('./runtime.js').Locale }?]} */ (args);
  const locale = assertIsLocale(options.locale ?? getLocale());
  /** @type {(inputs?: any, options?: { locale?: import('./runtime.js').Locale }) => import('./runtime.js').LocalizedString} */
  let message;
  try {
    if (typeof key !== 'string') throw new TypeError('Message key must be a string');
    const url = new URL('./messages/' + toSafeModuleId(key) + '.js', import.meta.url);
    const module = await import(/* @vite-ignore */ url.href);
    const exportName = key === 'then' ? '__paraglide_then' : key;
    if (!Object.hasOwn(module, exportName) || typeof module[exportName] !== 'function') {
      throw new Error('Unknown message: ' + key);
    }
    message = module[exportName];
  } catch (cause) {
    throw new MessageLoadError(key, locale, cause);
  }
  return message(inputs, { locale });
}

const reservedJsKeywords = ${JSON.stringify(reservedJsKeywords)};

/** @param {string} id */
function toSafeModuleId(id) {
  const result = id.toLowerCase().replace(/[^a-z0-9_]/g, '_');
  if (result[0]?.match(/[0-9]/) || reservedJsKeywords.includes(result)) return '_' + result;
  let numUppercase = 0;
  for (const char of id) if (char.match(/[A-Z]/)) numUppercase++;
  return result + (numUppercase > 0 ? String(numUppercase) : '');
}
`;
}
