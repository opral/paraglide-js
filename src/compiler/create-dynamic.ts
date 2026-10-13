/** Generate a native ESM loader without importing the message catalog. */
export function createDynamicFile(
	boundaries: string[],
	filenames: string[]
): string {
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
 * Load a sorted group of messages and call the requested message.
 * Literal imports work with native ESM and bundler code splitting.
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
    const load = loaders[groupFor(key)];
    if (!load) throw new Error('Unknown message: ' + key);
    const { messages } = await load();
    if (!Object.hasOwn(messages, key) || typeof messages[key] !== 'function') {
      throw new Error('Unknown message: ' + key);
    }
    message = messages[key];
  } catch (cause) {
    throw new MessageLoadError(key, locale, cause);
  }
  return message(inputs, { locale });
}

const boundaries = ${JSON.stringify(boundaries)};
/** @type {Array<() => Promise<any>>} */
const loaders = [${filenames.map((file) => `() => import(${JSON.stringify("./messages/" + file)})`).join(",\n")}];

/** @param {string} key */
function groupFor(key) {
 let low = 0, high = boundaries.length;
 while (low < high) {
  const middle = (low + high) >>> 1;
  if (/** @type {string} */ (boundaries[middle]) <= key) low = middle + 1;
  else high = middle;
 }
 return Math.max(0, low - 1);
}

`;
}
