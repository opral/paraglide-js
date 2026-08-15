/**
 * Returns a readable, filesystem-safe, collision-free identifier for a locale.
 *
 * The readable part is only for diagnostics. The complete UTF-8 hex suffix is
 * what guarantees that two different locale strings never share an output
 * directory, including locales which differ only by punctuation or Unicode.
 */
export function getPerLocaleBuildLocaleId(locale: string): string {
	const readable = locale.replace(/[^A-Za-z0-9_-]/g, "_") || "locale";
	const hex = Array.from(new TextEncoder().encode(locale), (byte) =>
		byte.toString(16).padStart(2, "0")
	).join("");
	return `${readable}-${hex}`;
}
