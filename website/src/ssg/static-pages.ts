import manifest from "../../../marketplace-manifest.json";
import blogToc from "../../../blog/table_of_contents.json";

export function paraglideStaticPages() {
	const paths = new Set<string>(["/"]);
	const pages = manifest.pages;
	if (!pages) return Array.from(paths);

	for (const [route, source] of Object.entries(flattenPages(pages))) {
		if (!isInternalPage(source)) continue;
		paths.add(route === "/" ? "/" : route);
	}

	paths.add("/blog");
	for (const entry of blogToc) {
		paths.add(`/blog/${entry.slug}`);
	}

	return Array.from(paths);
}

function flattenPages(
	pages: Record<string, string> | Record<string, Record<string, string>>
) {
	const flatPages: Record<string, string> = {};
	for (const [key, value] of Object.entries(pages) as Array<
		[string, string | Record<string, string>]
	>) {
		if (typeof value === "string") {
			flatPages[normalizeRoute(key)] = value;
		} else {
			for (const [route, source] of Object.entries(value)) {
				flatPages[normalizeRoute(route)] = source;
			}
		}
	}
	return flatPages;
}

function normalizeRoute(route: string) {
	if (!route || route === "/") return "/";
	return route.startsWith("/") ? route : `/${route}`;
}

function isInternalPage(source: string) {
	return (
		source.endsWith(".md") ||
		source.endsWith(".html") ||
		source.includes("github.com/TanStack/router")
	);
}
