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
	/** A helper of the other functions, not exported */
	internal?: true;
};

/**
 * The functions of the generated registry.js file, by name.
 */
const registryFunctions: Record<string, RegistryFunction> = {
	getIntlFormatter: {
		internal: true,
		jsdoc: `/**
 * @template T
 * @param {new (locale: string, options?: any) => T} Constructor
 * @param {string} locale
 * @param {any} options
 * @param {boolean | string} cacheable Compiler-created plain options only, or their key when all are literals.
 * @returns {T}
 */`,
		code: `function getIntlFormatter(Constructor, locale, options, cacheable) {
	// Arbitrary user options may have getters or Proxy traps. Only inspect
	// the plain data objects the compiler creates, or absent options.
	if (typeof locale !== "string" || (options !== undefined && !cacheable)) {
		return new Constructor(locale, options)
	}
	const state = /** @type {{ caches?: WeakMap<object, Map<string, any>>, prototypeKeys?: Set<string> }} */ (/** @type {unknown} */ (getIntlFormatter));
	// A string key marks options that are all literals. Their formatter is
	// built from their own properties only (ownOptions()), so Object.prototype
	// cannot reach it and needs no scan.
	const literal = typeof cacheable === "string";
	// Compiler literals inherit Object.prototype. Extensions to it may supply
	// Intl options, so preserve native reads instead of caching in that case.
	if (options !== undefined && !literal) {
		const standardKeys = state.prototypeKeys ??= new Set(["constructor", "__defineGetter__", "__defineSetter__", "hasOwnProperty", "__lookupGetter__", "__lookupSetter__", "isPrototypeOf", "propertyIsEnumerable", "toString", "valueOf", "__proto__", "toLocaleString"]);
		if (Object.getOwnPropertyNames(Object.prototype).some((name) => !standardKeys.has(name))) return new Constructor(locale, options)
	}
	// For options that are all literals, the compiler computed this key when
	// it compiled the message.
	let key = cacheable;
	if (typeof key !== "string") {
		const entries = [];
		for (const name of Object.keys(options ?? {}).sort()) {
			const value = options[name];
			if (value === undefined) continue
			if ((value !== null && !["string", "number", "boolean"].includes(typeof value)) || (typeof value === "number" && !Number.isFinite(value))) {
				return new Constructor(locale, options)
			}
			entries.push([name, value]);
		}
		key = JSON.stringify([locale, entries]);
	}
	// Without the scan, an inherited \`caches\` must not stand in for this one.
	if (literal && !Object.hasOwn(state, "caches")) {
		Object.defineProperty(state, "caches", { value: new WeakMap(), writable: true });
	}
	const caches = state.caches ??= new WeakMap();
	let cache = caches.get(Constructor);
	if (!cache) {
		cache = new Map();
		caches.set(Constructor, cache);
	}
	if (cache.has(key)) return cache.get(key)
	const formatter = new Constructor(locale, literal ? ownOptions(options) : options);
	// Bound retention when applications use dynamic formatter options.
	if (cache.size >= 256) {
		const oldest = cache.keys().next().value;
		if (oldest !== undefined) cache.delete(oldest);
	}
	cache.set(key, formatter);
	return formatter
};`,
	},
	ownOptions: {
		internal: true,
		jsdoc: `/**
 * A prototype-free copy of literal options. Compiled messages read only the
 * options they were written with, never ones added to Object.prototype.
 *
 * @param {any} options
 * @returns {any}
 */`,
		code: `function ownOptions(options) {
	return options === undefined ? undefined : Object.assign(Object.create(null), options)
};`,
	},
	ownOption: {
		internal: true,
		jsdoc: `/**
 * One option of literal options, read as an own property, see ownOptions().
 *
 * @param {any} options
 * @param {string} name
 * @returns {unknown}
 */`,
		code: `function ownOption(options, name) {
	return options !== undefined && Object.hasOwn(options, name) ? options[name] : undefined
};`,
	},
	plural: {
		jsdoc: `/**
 * Selects the plural category of "input - options.offset". The offset
 * comes from ICU MessageFormat 1 "{count, plural, offset:1 ...}" and does not
 * change exact matches like "=0", which compare the input itself.
 *
 * @param {import("./runtime.js").Locale} locale
 * @param {unknown} input
 * @param {Intl.PluralRulesOptions & { offset?: unknown }} [options]
 * @param {boolean | string} [cacheable=false] Internal compiler flag for plain data options, or their key when all are literals.
 * @returns {string}
 */`,
		code: `function plural(locale, input, options, cacheable = false) {
	return getIntlFormatter(Intl.PluralRules, locale, options, cacheable).select(Number(input) - Number((typeof cacheable === "string" ? ownOption(options, "offset") : options?.offset) ?? 0))
};`,
	},
	number: {
		jsdoc: `/**
 * @param {import("./runtime.js").Locale} locale
 * @param {unknown} input
 * @param {Intl.NumberFormatOptions} [options]
 * @param {boolean | string} [cacheable=false] Internal compiler flag for plain data options, or their key when all are literals.
 * @returns {string}
 */`,
		code: `function number(locale, input, options, cacheable = false) {
	return getIntlFormatter(Intl.NumberFormat, locale, options, cacheable).format(Number(input))
};`,
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
 * @param {boolean | string} [cacheable=false] Internal compiler flag of the number() call.
 * @returns {string}
 */`,
		code: `function icuPound(locale, input, options, cacheable = false) {
	const value = typeof input === "number" ? input : typeof input === "string" && input.trim() !== "" ? Number(input) : NaN
	if (!Number.isFinite(value)) return String(input)
	return number(locale, value - Number((typeof cacheable === "string" ? ownOption(options, "offset") : options?.offset) ?? 0), undefined, cacheable)
};`,
	},
	datetime: {
		jsdoc: `/**
 * @param {import("./runtime.js").Locale} locale
 * @param {unknown} input
 * @param {Intl.DateTimeFormatOptions} [options]
 * @param {boolean | string} [cacheable=false] Internal compiler flag for plain data options, or their key when all are literals.
 * @returns {string}
 */`,
		code: `function datetime(locale, input, options, cacheable = false) {
	const literal = typeof cacheable === "string";
	// The host default zone can change while the app is running.
	const formatter = cacheable && (literal ? ownOption(options, "timeZone") : options?.timeZone) !== undefined
		? getIntlFormatter(Intl.DateTimeFormat, locale, options, cacheable)
		: new Intl.DateTimeFormat(locale, literal ? ownOptions(options) : options);
	return formatter.format(new Date(/** @type {string} */ (input)))
};`,
	},
	relativetime: {
		jsdoc: `/**
 * @param {import("./runtime.js").Locale} locale
 * @param {unknown} input
 * @param {Intl.RelativeTimeFormatOptions & { unit: RelativeTimeFormatUnit }} options
 * @param {boolean | string} [cacheable=false] Internal compiler flag for plain data options, or their key when all are literals.
 * @returns {string}
 */`,
		code: `function relativetime(locale, input, options, cacheable = false) {
	const { unit, ...intlOptions } = options;
	return getIntlFormatter(Intl.RelativeTimeFormat, locale, intlOptions, cacheable).format(Number(input), unit);
};`,
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
	.map((fn) => `${fn.jsdoc}\n${fn.internal ? "" : "export "}${fn.code}`)
	.join("\n\n")}`;
}
