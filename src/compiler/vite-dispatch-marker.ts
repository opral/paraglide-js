/** Private binding name used only by Vite's post-tree-shaking dispatcher pass. */
export const VITE_DISPATCH_PREFIX = "__paraglide_dispatch_locale_";

export function createViteDispatchMarker(baseLocale: string): string {
	const points = Array.from(
		baseLocale,
		(character) => character.codePointAt(0)!
	);
	return `${VITE_DISPATCH_PREFIX}l${points.length}_${points.map((point) => point.toString(16)).join("_") || "x"}`;
}

export function decodeViteDispatchMarker(name: string): string | undefined {
	if (!name.startsWith(VITE_DISPATCH_PREFIX)) return undefined;
	const match = /^l(\d+)_(.+)$/.exec(name.slice(VITE_DISPATCH_PREFIX.length));
	if (!match) return undefined;
	const count = Number(match[1]);
	if (count === 0) return match[2] === "x" ? "" : undefined;
	const parts = match[2]!.split("_");
	if (parts.length !== count) return undefined;
	const points = parts.map((part) =>
		/^[0-9a-f]+$/.test(part) ? Number.parseInt(part, 16) : NaN
	);
	if (points.some((point) => !Number.isInteger(point) || point > 0x10ffff))
		return undefined;
	return points.map((point) => String.fromCodePoint(point)).join("");
}
