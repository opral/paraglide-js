/**
 * Selects the plural category of "input - options.offset". The offset
 * comes from ICU MessageFormat 1 "{count, plural, offset:1 ...}" and does not
 * change exact matches like "=0", which compare the input itself.
 *
 * @param {import("./runtime.js").Locale} locale
 * @param {unknown} input
 * @param {Intl.PluralRulesOptions & { offset?: unknown }} [options]
 * @param {boolean} [cacheable=false] Internal compiler flag for plain data options.
 * @returns {string}
 */
export function plural(locale: import("./runtime.js").Locale, input: unknown, options?: Intl.PluralRulesOptions & {
    offset?: unknown;
}, cacheable?: boolean): string;
/**
 * @param {import("./runtime.js").Locale} locale
 * @param {unknown} input
 * @param {Intl.NumberFormatOptions} [options]
 * @param {boolean} [cacheable=false] Internal compiler flag for plain data options.
 * @returns {string}
 */
export function number(locale: import("./runtime.js").Locale, input: unknown, options?: Intl.NumberFormatOptions, cacheable?: boolean): string;
/**
 * Formats "#" in ICU MessageFormat 1 plurals: the number "input - options.offset",
 * formatted like number(). The offset comes from "{count, plural, offset:1 ...}".
 * An input that is not a finite number (or a numeric string) is displayed as is,
 * without subtracting the offset.
 *
 * @param {import("./runtime.js").Locale} locale
 * @param {unknown} input
 * @param {{ offset?: unknown }} [options]
 * @returns {string}
 */
export function icuPound(locale: import("./runtime.js").Locale, input: unknown, options?: {
    offset?: unknown;
}): string;
/**
 * @param {import("./runtime.js").Locale} locale
 * @param {unknown} input
 * @param {Intl.DateTimeFormatOptions} [options]
 * @param {boolean} [cacheable=false] Internal compiler flag for plain data options.
 * @returns {string}
 */
export function datetime(locale: import("./runtime.js").Locale, input: unknown, options?: Intl.DateTimeFormatOptions, cacheable?: boolean): string;
/**
 * @param {import("./runtime.js").Locale} locale
 * @param {unknown} input
 * @param {Intl.RelativeTimeFormatOptions & { unit: RelativeTimeFormatUnit }} options
 * @param {boolean} [cacheable=false] Internal compiler flag for plain data options.
 * @returns {string}
 */
export function relativetime(locale: import("./runtime.js").Locale, input: unknown, options: Intl.RelativeTimeFormatOptions & {
    unit: RelativeTimeFormatUnit;
}, cacheable?: boolean): string;
export type RelativeTimeFormatUnit = "year" | "years" | "quarter" | "quarters" | "month" | "months" | "week" | "weeks" | "day" | "days" | "hour" | "hours" | "minute" | "minutes" | "second" | "seconds";
