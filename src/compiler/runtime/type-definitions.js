// ------ TYPES ------

/**
 * A locale that is available in the project.
 *
 * @example
 *   setLocale(request.locale as Locale)
 *
 * @typedef {string} Locale
 */

/**
 * A branded type representing a localized string.
 *
 * Message functions return this type instead of \`string\`, enabling TypeScript
 * to distinguish translated strings from regular strings at compile time.
 * This allows you to enforce that only properly localized content is used
 * in your UI components.
 *
 * Since \`LocalizedString\` is a branded subtype of \`string\`, it remains fully
 * backward compatible—you can pass it anywhere a \`string\` is expected.
 *
 * @example
 *   // Enforce localized strings in your components
 *   function PageTitle(props: { title: LocalizedString }) {
 *     return <h1>{props.title}</h1>
 *   }
 *
 *   // ✅ Correct: using a message function
 *   <PageTitle title={m.welcome_title()} />
 *
 *   // ❌ Type error: raw strings are not LocalizedString
 *   <PageTitle title="Welcome" />
 *
 * @example
 *   // LocalizedString is assignable to string (backward compatible)
 *   const localized: LocalizedString = m.greeting()
 *   const str: string = localized  // ✅ works fine
 *
 *   // But string is not assignable to LocalizedString
 *   const raw: LocalizedString = "Hello"  // ❌ Type error
 *
 * @example
 *   // Catches accidental string concatenation
 *   function showMessage(msg: LocalizedString) { ... }
 *
 *   showMessage(m.hello())                    // ✅
 *   showMessage("Hello " + userName)          // ❌ Type error
 *   showMessage(m.hello_user({ name: userName }))  // ✅ use params instead
 *
 * @typedef {string & { readonly __brand: 'LocalizedString' }} LocalizedString
 */

/**
 * A single markup option passed to a tag instance.
 *
 * @typedef {{
 *   name: string;
 *   value: unknown;
 * }} MessageMarkupOption
 */

/**
 * A single static markup attribute attached to a tag instance.
 *
 * @typedef {{
 *   name: string;
 *   value: string | true;
 * }} MessageMarkupAttribute
 */

/**
 * Record of markup options for a tag instance.
 *
 * @typedef {Record<string, unknown>} MessageMarkupOptions
 */

/**
 * Record of markup attributes for a tag instance.
 *
 * @typedef {Record<string, string | true>} MessageMarkupAttributes
 */

/**
 * Type-level schema for a single markup tag.
 *
 * @typedef {{
 *   options: MessageMarkupOptions;
 *   attributes: MessageMarkupAttributes;
 *   children: boolean;
 * }} MessageMarkupTag
 */

/**
 * Type-level schema for all markup tags in a message.
 *
 * @typedef {Record<string, MessageMarkupTag>} MessageMarkupSchema
 */

/**
 * Type-only metadata attached to compiled message functions.
 *
 * @template Inputs
 * @template Options
 * @template {MessageMarkupSchema} [Markup = MessageMarkupSchema]
 * @typedef {{
 *   readonly __paraglide?: {
 *     inputs: Inputs;
 *     options: Options;
 *     markup: Markup;
 *   };
 * }} MessageMetadata
 */

/**
 * A compiled, framework-neutral message part.
 *
 * @typedef {{
 *   type: "text";
 *   value: string;
 * } | {
 *   type: "markup-start";
 *   name: string;
 *   options: MessageMarkupOptions;
 *   attributes: MessageMarkupAttributes;
 * } | {
 *   type: "markup-end";
 *   name: string;
 *   options: MessageMarkupOptions;
 *   attributes: MessageMarkupAttributes;
 * } | {
 *   type: "markup-standalone";
 *   name: string;
 *   options: MessageMarkupOptions;
 *   attributes: MessageMarkupAttributes;
 * }} MessagePart
 */

/**
 * A message function is a message for a specific locale.
 *
 * @example
 *   m.hello({ name: 'world' })
 *
 * @typedef {(inputs?: Record<string, never>) => LocalizedString} MessageFunction
 */

/**
 * A message bundle function that selects the message to be returned.
 *
 * Uses `getLocale()` under the hood to determine the locale with an option.
 *
 * @template {string} T
 *
 * @example
 *   import { m } from './messages.js'
 *   m.hello({ name: 'world', { locale: "en" } })
 *
 * @typedef {(params: Record<string, never>, options: { locale: T }) => LocalizedString} MessageBundleFunction
 */
