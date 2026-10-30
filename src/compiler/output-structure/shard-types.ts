export function optionsType(locales: readonly string[]): string {
	return `{ locale?: ${locales.map((l) => JSON.stringify(l)).join(" | ") || "never"} }`;
}

/**
 * Shared aliases keep each message's public input and metadata types intact.
 * They are declared once, in `messages/_shard_types`, which the message barrel
 * never re-exports, and each shard imports them type-only. Declared in each
 * shard, they would be exported with it (a JSDoc typedef always is), and the
 * barrel's `export *` of two shards would export the same names twice.
 */
export const shardTypesModule = "_shard_types";

/** `messages/_shard_types.js`. */
export function jsShardTypes(locales: readonly string[]): string {
	return `/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */
/** @typedef {${optionsType(locales)}} __ParaglideOptions */
/**
 * @template I
 * @typedef {((inputs: I, options?: __ParaglideOptions) => LocalizedString) & import('../runtime.js').MessageMetadata<I, __ParaglideOptions, {}>} __ParaglideMessage
 */
/**
 * @template I
 * @typedef {((inputs?: I, options?: __ParaglideOptions) => LocalizedString) & import('../runtime.js').MessageMetadata<I, __ParaglideOptions, {}>} __ParaglideOptionalMessage
 */
export {};
`;
}

export const jsShardTypesImport = `/** @import { __ParaglideOptions, __ParaglideMessage, __ParaglideOptionalMessage } from './${shardTypesModule}.js' */`;

/** `messages/_shard_types.d.ts`. */
export function declarationShardTypes(locales: readonly string[]): string {
	return `import type { LocalizedString, MessageMetadata } from "../runtime.js";
export type __ParaglideOptions = ${optionsType(locales)};
export type __ParaglideMessage<I> = ((inputs: I, options?: __ParaglideOptions) => LocalizedString) & MessageMetadata<I, __ParaglideOptions, {}>;
export type __ParaglideOptionalMessage<I> = ((inputs?: I, options?: __ParaglideOptions) => LocalizedString) & MessageMetadata<I, __ParaglideOptions, {}>;
`;
}

export const declarationShardTypesImport = `import type { __ParaglideMessage, __ParaglideOptionalMessage } from "./${shardTypesModule}.js";`;

/** Typed pure factories share locale dispatch while retaining each public function's name/arity. */
export function jsShardFactory(
	locales: readonly string[],
	baseLocale: string,
	optional: boolean
): string {
	const fallback = locales.includes(baseLocale)
		? baseLocale
		: locales[locales.length - 1];
	const names = locales.map((_, i) => `locale${i}`);
	const kind = optional ? "__ParaglideOptionalMessage" : "__ParaglideMessage";
	const name = optional ? "__paraglideOptionalMessage" : "__paraglideMessage";
	const signature = optional ? "inputs?: I" : "inputs: I";
	return `/**
 * @template I
 * @param {string} name
${names.map((n) => ` * @param {(i: I) => LocalizedString} ${n}`).join("\n")}
 * @returns {${kind}<I>}
 */
function ${name}(name, ${names.join(", ")}) {
  /** @type {(${signature}, options?: __ParaglideOptions) => LocalizedString} */
  const message = (i${optional ? " = /** @type {I} */ ({})" : ""}, options = {}) => {
    const locale = experimentalStaticLocale ?? options.locale ?? getLocale();
${locales
	.map((l, i) =>
		l === fallback
			? ""
			: `    if (locale === ${JSON.stringify(l)}) return ${names[i]}(i);`
	)
	.filter(Boolean)
	.join("\n")}
    return ${names[locales.indexOf(fallback!)]}(i);
  };
  Object.defineProperty(message, "name", { value: name });
  return message;
}`;
}
