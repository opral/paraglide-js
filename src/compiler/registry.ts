/**
 * Re: CUSTOMIZING THE REGISTRY
 *
 * We want to enable anyone (designer, developer, translator) to
 * specify options for functions. That requires design work in
 * the inlang SDK.
 *
 * For now, Paraglide ships a custom solution with INTL functions.
 */

type RegistryFunction = {
	/** JSDoc of the function in registry.js */
	jsdoc: string;
	/** The function declaration, without `export` */
	code: string;
	/** Registry functions the code calls */
	dependencies: string[];
};

/**
 * The functions of the generated registry.js file, by name.
 */
const registryFunctions: Record<string, RegistryFunction> = {
	plural: {
		jsdoc: `/**
 * Selects the plural category of "input - options.offset". The offset
 * comes from ICU MessageFormat 1 "{count, plural, offset:1 ...}" and does not
 * change exact matches like "=0", which compare the input itself.
 *
 * @param {import("./runtime.js").Locale} locale
 * @param {unknown} input
 * @param {Intl.PluralRulesOptions & { offset?: unknown }} [options]
 * @returns {string}
 */`,
		code: `function plural(locale, input, options) {
	return new Intl.PluralRules(locale, options).select(Number(input) - Number(options?.offset ?? 0))
};`,
		dependencies: [],
	},
	number: {
		jsdoc: `/**
 * @param {import("./runtime.js").Locale} locale
 * @param {unknown} input
 * @param {Intl.NumberFormatOptions} [options]
 * @returns {string}
 */`,
		code: `function number(locale, input, options) {
	return new Intl.NumberFormat(locale, options).format(Number(input))
};`,
		dependencies: [],
	},
	icuPound: {
		jsdoc: `/**
 * Formats "#" in ICU MessageFormat 1 plurals: the number "input - options.offset",
 * formatted like number(). The offset comes from "{count, plural, offset:1 ...}".
 * An input that is not a finite number (or a numeric string) is displayed as is,
 * without subtracting the offset.
 *
 * @param {import("./runtime.js").Locale} locale
 * @param {unknown} input
 * @param {{ offset?: unknown }} [options]
 * @returns {string}
 */`,
		code: `function icuPound(locale, input, options) {
	const value = typeof input === "number" ? input : typeof input === "string" && input.trim() !== "" ? Number(input) : NaN
	if (!Number.isFinite(value)) return String(input)
	return number(locale, value - Number(options?.offset ?? 0))
};`,
		dependencies: ["number"],
	},
	datetime: {
		jsdoc: `/**
 * @param {import("./runtime.js").Locale} locale
 * @param {unknown} input
 * @param {Intl.DateTimeFormatOptions} [options]
 * @returns {string}
 */`,
		code: `function datetime(locale, input, options) {
	return new Intl.DateTimeFormat(locale, options).format(new Date(/** @type {string} */ (input)))
};`,
		dependencies: [],
	},
	relativetime: {
		jsdoc: `/**
 * @param {import("./runtime.js").Locale} locale
 * @param {unknown} input
 * @param {Intl.RelativeTimeFormatOptions & { unit: RelativeTimeFormatUnit }} options
 * @returns {string}
 */`,
		code: `function relativetime(locale, input, options) {
	const { unit, ...intlOptions } = options;
	return new Intl.RelativeTimeFormat(locale, intlOptions).format(Number(input), unit);
};`,
		dependencies: [],
	},
};

/**
 * Creates the Registry file
 */
export function createRegistry(): string {
	return `
/**
 * @typedef {"year" | "years" | "quarter" | "quarters" | "month" | "months" | "week" | "weeks" | "day" | "days" | "hour" | "hours" | "minute" | "minutes" | "second" | "seconds"} RelativeTimeFormatUnit
 */

${Object.values(registryFunctions)
	.map((fn) => `${fn.jsdoc}\nexport ${fn.code}`)
	.join("\n\n")}`;
}

/**
 * Returns the given registry functions and the registry functions they call,
 * in registry order.
 *
 * @example
 *   withRegistryDependencies(["icuPound"]) // ["number", "icuPound"]
 */
export function withRegistryDependencies(names: Iterable<string>): string[] {
	const needed = new Set<string>();
	const add = (name: string) => {
		const fn = registryFunctions[name];
		if (!fn || needed.has(name)) return;
		needed.add(name);
		fn.dependencies.forEach(add);
	};
	for (const name of names) add(name);
	return Object.keys(registryFunctions).filter((name) => needed.has(name));
}

/**
 * Returns the code of the given registry functions without `export`, by name.
 */
export function registryFunctionCode(
	names: Iterable<string>
): Record<string, string> {
	return Object.fromEntries(
		Array.from(names).flatMap((name) => {
			const fn = registryFunctions[name];
			return fn ? [[name, fn.code]] : [];
		})
	);
}
