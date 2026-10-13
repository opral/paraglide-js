import { toLocale } from "./check-locale.js";

// qvalue grammar from https://www.rfc-editor.org/rfc/rfc9110#section-12.4.2
const qvaluePattern = /^(?:0(?:\.\d{0,3})?|1(?:\.0{0,3})?)$/;

/**
 * Extracts a locale from the accept-language header.
 *
 * Use the function on the server to extract the locale
 * from the accept-language header that is sent by the client.
 *
 * @example
 *   const locale = extractLocaleFromHeader(request);
 *
 * @param {Request} request - The request object to extract the locale from.
 * @returns {Locale | undefined} The negotiated preferred language.
 */
export function extractLocaleFromHeader(request) {
	const acceptLanguageHeader = request.headers.get("accept-language");
	if (acceptLanguageHeader) {
		// Parse language preferences with their q-values and base language codes
		const languages = splitOutsideQuotes(acceptLanguageHeader, ",")
			.map((lang) => {
				const [tag = "", ...params] = splitOutsideQuotes(lang, ";").map((p) =>
					p.trim()
				);
				const weight = params.find((param) => /^q(?:\s|=|$)/i.test(param));
				const q = weight ? weight.replace(/^q\s*=\s*/i, "") : "1";
				// Get both the full tag and base language code
				const baseTag = tag.split("-")[0];
				return {
					fullTag: tag,
					baseTag,
					q: qvaluePattern.test(q) ? Number(q) : 0,
				};
			})
			// Skip ranges that are not acceptable (q=0) or have an invalid weight
			.filter((lang) => lang.q > 0)
			.sort((a, b) => b.q - a.q);

		for (const lang of languages) {
			const fullLocale = toLocale(lang.fullTag);
			if (fullLocale) {
				return fullLocale;
			}

			const baseLocale = toLocale(lang.baseTag);
			if (baseLocale) {
				return baseLocale;
			}
		}

		return undefined;
	}

	return undefined;
}

/**
 * Splits on a separator that is not inside a quoted string, since parameter
 * values may be quoted strings that contain `,` or `;`.
 *
 * @param {string} value
 * @param {string} separator
 * @returns {string[]}
 */
function splitOutsideQuotes(value, separator) {
	/** @type {string[]} */
	const parts = [];
	let start = 0;
	// Index of the quote that opened the current quoted string, or -1
	let quoteStart = -1;
	for (let i = 0; i < value.length; i++) {
		const char = value[i];
		if (quoteStart !== -1 && char === "\\") {
			i++;
		} else if (char === '"') {
			quoteStart = quoteStart === -1 ? i : -1;
		} else if (quoteStart === -1 && char === separator) {
			parts.push(value.slice(start, i));
			start = i + 1;
		}
	}
	if (quoteStart === -1) {
		parts.push(value.slice(start));
		return parts;
	}
	// A quote that is never closed would swallow everything after it, so only
	// the text from that quote on is split as if it weren't quoted
	const [rest = "", ...tail] = value.slice(quoteStart).split(separator);
	parts.push(value.slice(start, quoteStart) + rest, ...tail);
	return parts;
}
