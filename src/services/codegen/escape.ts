/**
 * Keeps a string literal from ending the JSDoc comment it is written in, e.g.
 * as a property name in a type: the escape `\/` keeps the value of the string.
 */
export function escapeCommentTerminator(literal: string): string {
	return literal.replaceAll("*/", "*\\/");
}

/**
 * Escapes some Text so that it can safely be used inside a template literal.
 */
export function escapeForTemplateLiteral(text: string): string {
	if (typeof text === "string" && !/[\\`]|\$\{/.test(text)) return text;
	return text
		.replace(/\\/g, "\\\\")
		.replace(/`/g, "\\`")
		.replace(/\${/g, "\\${");
}

/**
 * Escapes some Text so that it can safely be used inside a single quote string.s
 */
export function escapeForSingleQuoteString(text: string): string {
	return escapeLineTerminators(
		text.replace(/\\/g, "\\\\").replace(/'/g, "\\'")
	);
}

export function escapeForDoubleQuoteString(text: string): string {
	return escapeLineTerminators(
		text.replace(/\\/g, "\\\\").replace(/"/g, '\\"')
	);
}

/**
 * A quoted string literal cannot contain a raw line break (and before ES2019
 * not U+2028 or U+2029 either), so these are written as `\uXXXX` escapes.
 */
function escapeLineTerminators(text: string): string {
	return text.replace(
		/[\n\r\u2028\u2029]/g,
		(char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`
	);
}
