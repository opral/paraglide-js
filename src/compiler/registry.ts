/**
 * Re: CUSTOMIZING THE REGISTRY
 *
 * We want to enable anyone (designer, developer, translator) to
 * specify options for functions. That requires design work in
 * the inlang SDK.
 *
 * For now, Paraglide ships a custom solution with INTL functions.
 */

/**
 * Creates the Registry file
 */
export function createRegistry(): string {
	return `
/**
 * @param {import("./runtime.js").Locale} locale
 * @param {unknown} input
 * @param {(Intl.PluralRulesOptions & { offset?: number | string })} [options]
 * @returns {string}
 */
export function plural(locale, input, options) { 
	const offset = Number(options?.offset ?? 0)
	const pluralOptions = options ? { ...options } : {}
	delete pluralOptions.offset
	return new Intl.PluralRules(locale, pluralOptions).select(Number(input) - offset)
};

/**
 * @param {unknown} input
 * @param {string} key
 * @returns {boolean}
 */
export function numberExact(input, key) {
	return JSON.stringify(Number(input)) === key
};

/**
 * @param {import("./runtime.js").Locale} locale
 * @param {unknown} input
 * @param {Intl.NumberFormatOptions} [options]
 * @returns {string}
 */
export function number(locale, input, options) {
	return new Intl.NumberFormat(locale, options).format(Number(input))
};

/**
 * @param {import("./runtime.js").Locale} locale
 * @param {unknown} input
 * @param {Intl.DateTimeFormatOptions} [options]
 * @returns {string}
 */
export function datetime(locale, input, options) {
	return new Intl.DateTimeFormat(locale, options).format(new Date(/** @type {string} */ (input)))
};`;
}
