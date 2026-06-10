import { parse } from "@opral/markdown-wc";
import { notFound, redirect } from "@tanstack/react-router";
import manifestJson from "../../../marketplace-manifest.json";
import {
	OLD_MARKETPLACE_BASE,
	OLD_MARKETPLACE_PATH,
	RAW_GITHUB_BASE,
	SITE_URL,
} from "../site";

const localMarkdownFiles = import.meta.glob<string>(
	[
		"../../../README.md",
		"../../../CHANGELOG.md",
		"../../../docs/**/*.md",
		"../../../docs-api/**/*.md",
		"../../../benchmark/README.md",
		"../../../examples/*/README.md",
	],
	{
		query: "?raw",
		import: "default",
	}
);

export type Manifest = typeof manifestJson;

export type DocsHeading = {
	id: string;
	text: string;
	level: number;
};

export type DocsSection = {
	title: string;
	pages: DocsNavPage[];
};

export type DocsNavPage = {
	route: string;
	source: string;
	title: string;
	isExternal: boolean;
	href: string;
};

export type DocsPageData = {
	markdown: string;
	rawMarkdown: string;
	frontmatter?: Record<string, {}>;
	pagePath: string;
	source: string;
	editUrl?: string;
	imports?: string[];
	headings: DocsHeading[];
	sections: DocsSection[];
	prevPagePath?: string;
	nextPagePath?: string;
};

type MirrorSpec = {
	rawUrl: string;
	sourceUrl: string;
	sourceLabel: string;
	ogTitle: string;
	ogDescription: string;
	ogImage: string;
	heroImage: string;
	heroImageAlt: string;
	pitch: string;
};

const mirrorPages: Record<string, MirrorSpec> = {
	"/tanstack-router": {
		rawUrl:
			"https://raw.githubusercontent.com/TanStack/router/main/examples/react/i18n-paraglide/README.md",
		sourceUrl:
			"https://github.com/TanStack/router/tree/main/examples/react/i18n-paraglide",
		sourceLabel: "TanStack/router",
		ogTitle: "Paraglide JS for TanStack Router",
		ogDescription:
			"Type-safe i18n with tiny bundles. Integrated with TanStack Router and tested in TanStack's CI/CD pipeline.",
		ogImage: "https://inlang.com/tanstack-router-banner.svg",
		heroImage: "https://inlang.com/tanstack-router-banner.svg",
		heroImageAlt: "Paraglide JS for TanStack Router overview",
		pitch: [
			"- Fully type-safe with IDE autocomplete",
			"- SEO-friendly localized URLs",
			"- Works with CSR, SSR, and SSG",
			"- Tested as part of [TanStack's CI/CD pipeline](https://paraglidejs.com/blog/tanstack-ci)",
		].join("\n"),
	},
	"/tanstack-start": {
		rawUrl:
			"https://raw.githubusercontent.com/TanStack/router/main/examples/react/start-i18n-paraglide/README.md",
		sourceUrl:
			"https://github.com/TanStack/router/tree/main/examples/react/start-i18n-paraglide",
		sourceLabel: "TanStack/router",
		ogTitle: "Paraglide JS for TanStack Start",
		ogDescription:
			"Type-safe i18n with tiny bundles. Integrated with TanStack Start and tested in TanStack's CI/CD pipeline.",
		ogImage: "https://inlang.com/tanstack-start-banner.svg",
		heroImage: "https://inlang.com/tanstack-start-banner.svg",
		heroImageAlt: "Paraglide JS for TanStack Start overview",
		pitch: [
			"- Fully type-safe with IDE autocomplete",
			"- SEO-friendly localized URLs",
			"- Works with CSR, SSR, and SSG",
			"- Tested as part of [TanStack's CI/CD pipeline](https://paraglidejs.com/blog/tanstack-ci)",
		].join("\n"),
	},
};

export async function loadDocsPage(route: string): Promise<DocsPageData> {
	const pagePath = normalizeRoute(route);
	const sections = getDocsSections();
	const flatPages = flattenManifestPages();
	const source = flatPages[pagePath];

	if (!source) {
		if (pagePath !== "/") {
			throw notFound();
		}
		throw notFound();
	}

	const pageLinkMap = buildPageLinkMap(flatPages);
	const mirrorSpec = mirrorPages[pagePath];
	const content = mirrorSpec
		? await loadMirrorMarkdown(mirrorSpec)
		: await loadMarkdownSource(source);
	const sourceUrl = mirrorSpec ? mirrorSpec.rawUrl : sourceToRawUrl(source);
	const parsed = await parse(content);
	const frontmatter = resolveFrontmatterLinks(
		parsed.frontmatter as Record<string, {}> | undefined,
		sourceUrl
	);
	const imports = frontmatter?.imports as string[] | undefined;
	const html = normalizeMarkdownAlerts(
		resolveHtmlLinks(parsed.html, sourceUrl, pageLinkMap)
	);
	const { html: markdown, headings } = extractHeadingsAndInjectIds(html);
	const { prevRoute, nextRoute } = getPageNeighbors(flatPages, pagePath);

	return {
		markdown,
		rawMarkdown: content,
		frontmatter,
		pagePath,
		source,
		editUrl: getEditUrl(source, mirrorSpec),
		imports,
		headings,
		sections,
		prevPagePath: prevRoute,
		nextPagePath: nextRoute,
	};
}

export function getDocsSections(): DocsSection[] {
	const sections: DocsSection[] = [];
	const flatPages: DocsNavPage[] = [];

	for (const [sectionName, value] of Object.entries(manifestJson.pages)) {
		if (typeof value === "string") {
			const route = normalizeRoute(sectionName);
			flatPages.push(toNavPage(route, value));
		} else {
			sections.push({
				title: sectionName || "Overview",
				pages: Object.entries(value).map(([route, source]) =>
					toNavPage(normalizeRoute(route), source)
				),
			});
		}
	}

	if (flatPages.length > 0) {
		sections.unshift({ title: "Overview", pages: flatPages });
	}

	return sections;
}

export function flattenManifestPages() {
	const flatPages: Record<string, string> = {};

	for (const [key, value] of Object.entries(manifestJson.pages)) {
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

export function normalizeRoute(route: string) {
	if (!route || route === "/") return "/";
	const withLeadingSlash = route.startsWith("/") ? route : `/${route}`;
	return withLeadingSlash.replace(/\/+$/, "") || "/";
}

export function formatNavTitle(slug: string) {
	const normalized = slug.toLowerCase();
	const directMap: Record<string, string> = {
		sveltekit: "SvelteKit",
		"react-router": "React Router",
		"next-js": "Next.js",
		"tanstack-router": "TanStack Router",
		"tanstack-start": "TanStack Start",
		"vanilla-js-ts": "Vanilla JS/TS",
		"i18n-routing": "i18n Routing",
	};

	if (directMap[normalized]) {
		return directMap[normalized];
	}

	return normalized
		.split("-")
		.filter(Boolean)
		.map((word) => word[0]?.toUpperCase() + word.slice(1))
		.join(" ");
}

function toNavPage(route: string, source: string): DocsNavPage {
	const isExternal = isExternalPage(source, route);
	const slug = route.split("/").filter(Boolean).at(-1) || "introduction";

	return {
		route,
		source,
		title: formatNavTitle(slug),
		isExternal,
		href: isExternal ? externalHref(source) : route,
	};
}

function isExternalPage(source: string, route: string) {
	if (mirrorPages[route]) return false;
	return !source.endsWith(".md") && !source.endsWith(".html");
}

function externalHref(source: string) {
	if (source.startsWith("http")) return source;
	if (source.startsWith("/m/")) return `https://inlang.com${source}`;
	return source;
}

async function loadMarkdownSource(source: string) {
	if (source.startsWith("http")) {
		const response = await fetch(source);
		if (!response.ok) throw redirect({ to: "/" });
		return response.text();
	}

	const loader = localMarkdownFiles[toLocalGlobKey(source)];
	if (!loader) {
		throw new Error(`Missing Paraglide docs source: ${source}`);
	}
	return loader();
}

async function loadMirrorMarkdown(spec: MirrorSpec) {
	const response = await fetch(spec.rawUrl);
	if (!response.ok) throw redirect({ to: "/" });
	const exampleMarkdown = await response.text();
	return buildMirrorMarkdown(spec, exampleMarkdown);
}

function toLocalGlobKey(source: string) {
	const normalized = source.replace(/^[./]+/, "");
	return `../../../${normalized}`;
}

function sourceToRawUrl(source: string) {
	if (source.startsWith("http")) return source;
	const normalized = source.replace(/^[./]+/, "");
	return `${RAW_GITHUB_BASE}${normalized}`;
}

function getEditUrl(source: string, mirrorSpec?: MirrorSpec) {
	if (mirrorSpec) return mirrorSpec.sourceUrl;
	if (source.startsWith("https://github.com")) return source;
	if (source.startsWith("https://raw.githubusercontent.com")) {
		return source
			.replace("raw.githubusercontent.com", "github.com")
			.replace("/refs/heads/", "/blob/");
	}
	if (source.startsWith("http")) return undefined;
	const normalized = source.replace(/^[./]+/, "");
	return `https://github.com/opral/paraglide-js/blob/main/${normalized}`;
}

type PageLinkMap = Map<string, string>;

function buildPageLinkMap(pages: Record<string, string>) {
	const map: PageLinkMap = new Map();

	for (const [route, source] of Object.entries(pages)) {
		if (isExternalPage(source, route)) continue;
		const target = route === "/" ? "/" : route;
		addPageLinkMapEntry(map, sourceToRawUrl(source), target);
		if (!source.startsWith("http")) {
			addPageLinkMapEntry(map, source.replace(/^[./]+/, ""), target);
		}
	}

	addPageLinkMapEntry(map, "docs/compiler-options.md", "/compiler-options");
	addPageLinkMapEntry(map, "docs/standalone-servers.md", "/standalone-servers");
	addPageLinkMapEntry(map, "docs-api/runtime/type/README.md", "/runtime");
	addPageLinkMapEntry(map, "docs-api/server/type/README.md", "/server");

	return map;
}

function addPageLinkMapEntry(map: PageLinkMap, value: string, target: string) {
	map.set(normalizeLinkKey(value), target);
	map.set(normalizeLinkKey(sourceToRawUrl(value)), target);
}

export function resolveHtmlLinks(
	html: string,
	baseUrl: string,
	pageLinkMap: PageLinkMap = new Map()
) {
	const resolvedHtml = html.replace(
		/(src|href)=(["'])([^"']+)\2/gi,
		(_match, attr, quote, value) => {
			const attribute = String(attr).toLowerCase();
			const url = rewriteOldMarketplaceUrl(String(value));
			if (url !== value) return `${attr}=${quote}${url}${quote}`;
			if (url.startsWith("#")) return `${attr}=${quote}${url}${quote}`;

			const resolved = resolveRelativeUrl(url, baseUrl, {
				appendMarkdownExtension: attribute === "href",
			});

			if (attribute === "href") {
				const pageTarget = pageLinkMap.get(normalizeLinkKey(resolved));
				if (pageTarget) {
					return `${attr}=${quote}${pageTarget}${extractSearchAndHash(resolved)}${quote}`;
				}
				const oldMarketplace = rewriteOldMarketplaceUrl(resolved);
				if (oldMarketplace !== resolved) {
					return `${attr}=${quote}${oldMarketplace}${quote}`;
				}
			}

			return `${attr}=${quote}${resolved}${quote}`;
		}
	);

	return rewriteOldMarketplaceAnchorText(resolvedHtml);
}

function rewriteOldMarketplaceAnchorText(html: string) {
	return html.replace(
		/>(https:\/\/inlang\.com\/m\/gerre34r\/library-inlang-paraglideJs[^<]*|\/m\/gerre34r\/library-inlang-paraglideJs[^<]*)</g,
		(match, value) => {
			const rewritten = rewriteOldMarketplaceUrl(String(value));
			return rewritten === value ? match : `>${rewritten}<`;
		}
	);
}

export function normalizeMarkdownAlerts(html: string) {
	const alertTypes = new Set([
		"note",
		"tip",
		"important",
		"warning",
		"caution",
	]);

	return html.replace(
		/<blockquote([^>]*)>\s*<p>\s*(?:<span[^>]*>)?\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\](?:<\/span>)?\s*([\s\S]*?)<\/p>\s*<\/blockquote>/gi,
		(match, attrs, type, content) => {
			const alertType = String(type).toLowerCase();
			if (!alertTypes.has(alertType)) return match;
			const cleanAttrs = String(attrs).replace(/\sdata-mwc-alert=(["']).*?\1/i, "");
			const cleanedContent = String(content).trimStart();
			return `<blockquote${cleanAttrs} data-mwc-alert="${alertType}"><p><span data-mwc-alert-marker>[!${String(type).toUpperCase()}]</span>${cleanedContent}</p></blockquote>`;
		}
	);
}

export function rewriteOldMarketplaceUrl(value: string) {
	const oldBase = value.startsWith(OLD_MARKETPLACE_BASE)
		? OLD_MARKETPLACE_BASE
		: value.startsWith(OLD_MARKETPLACE_PATH)
			? OLD_MARKETPLACE_PATH
			: undefined;
	if (!oldBase) return value;
	const suffix = value.slice(oldBase.length);
	if (!suffix || suffix === "/") return "/";
	if (suffix === "/next") return "/next-js";
	return suffix;
}

function resolveFrontmatterLinks(
	frontmatter: Record<string, {}> | undefined,
	baseUrl: string
) {
	if (!frontmatter) return frontmatter;
	const resolved = { ...frontmatter };
	const urlKeys = ["og:image", "og:image:secure_url", "twitter:image"];

	for (const key of urlKeys) {
		const value = resolved[key];
		if (typeof value === "string") {
			resolved[key] = resolveRelativeUrl(value, baseUrl, {
				appendMarkdownExtension: false,
			});
		}
	}

	if (Array.isArray(resolved.imports)) {
		resolved.imports = resolved.imports.map((value) =>
			typeof value === "string"
				? resolveRelativeUrl(value, baseUrl, { appendMarkdownExtension: false })
				: value
		);
	}

	return resolved;
}

export function resolveRelativeUrl(
	value: string,
	baseUrl: string,
	options: { appendMarkdownExtension?: boolean } = {}
) {
	if (!isRelativeUrl(value)) return value;
	const normalizedValue =
		options.appendMarkdownExtension &&
		shouldAppendMarkdownExtension(value, baseUrl)
			? appendMarkdownExtension(value, baseUrl)
			: value;
	try {
		return new URL(normalizedValue, baseUrl).toString();
	} catch {
		return value;
	}
}

function shouldAppendMarkdownExtension(value: string, baseUrl: string) {
	if (!isRawGithubUrl(baseUrl)) return false;
	const baseExtension = getMarkdownExtension(baseUrl);
	if (!baseExtension) return false;
	const { path } = splitPathAndSuffix(value);
	if (!path || path.endsWith("/")) return false;
	return !hasPathExtension(path);
}

function appendMarkdownExtension(value: string, baseUrl: string) {
	const extension = getMarkdownExtension(baseUrl);
	if (!extension) return value;
	const { path, suffix } = splitPathAndSuffix(value);
	if (!path) return value;
	return `${path}${extension}${suffix}`;
}

function splitPathAndSuffix(value: string) {
	const match = value.match(/^([^?#]*)([?#].*)?$/);
	return { path: match?.[1] ?? "", suffix: match?.[2] ?? "" };
}

function hasPathExtension(path: string) {
	const lastSegment = path.split("/").pop() ?? "";
	return Boolean(lastSegment && lastSegment.includes("."));
}

function isRawGithubUrl(baseUrl: string) {
	try {
		return new URL(baseUrl).hostname === "raw.githubusercontent.com";
	} catch {
		return baseUrl.includes("raw.githubusercontent.com");
	}
}

function getMarkdownExtension(baseUrl: string) {
	try {
		const url = new URL(baseUrl);
		if (url.pathname.endsWith(".md")) return ".md";
		if (url.pathname.endsWith(".markdown")) return ".markdown";
	} catch {
		if (baseUrl.endsWith(".md")) return ".md";
		if (baseUrl.endsWith(".markdown")) return ".markdown";
	}
	return null;
}

function isRelativeUrl(value: string) {
	if (!value) return false;
	if (value.startsWith("#")) return false;
	if (value.startsWith("/")) return false;
	if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(value)) return false;
	return true;
}

function normalizeLinkKey(value: string) {
	try {
		const url = new URL(value);
		url.hash = "";
		url.search = "";
		return url.toString();
	} catch {
		return value;
	}
}

function extractSearchAndHash(value: string) {
	try {
		const url = new URL(value);
		return `${url.search}${url.hash}`;
	} catch {
		return "";
	}
}

export function extractHeadingsAndInjectIds(html: string): {
	html: string;
	headings: DocsHeading[];
} {
	const headings: DocsHeading[] = [];
	const headingRegex = /<h([1-3])([^>]*)>(.*?)<\/h\1>/gis;
	const usedIds = new Set<string>();

	const updatedHtml = html.replace(
		headingRegex,
		(_match, level, attrs, inner) => {
			const text = decodeHtmlEntities(stripHtml(String(inner))).trim();
			if (!text) return _match;
			const baseId = slugifyHeading(text);
			const id = uniqueHeadingId(baseId, usedIds);
			headings.push({ id, text, level: Number(level) });
			const cleanAttrs = String(attrs).replace(/\s+id=(["']).*?\1/i, "");
			const updatedInner = updateHeadingAnchorHref(String(inner), id);
			return `<h${level}${cleanAttrs} id="${id}">${updatedInner}</h${level}>`;
		}
	);
	return { html: updatedHtml, headings };
}

function updateHeadingAnchorHref(inner: string, id: string) {
	return inner.replace(
		/(<a\b[^>]*\shref=)(["'])#[^"']*\2/i,
		(_match, prefix, quote) => `${prefix}${quote}#${id}${quote}`
	);
}

function uniqueHeadingId(baseId: string, usedIds: Set<string>) {
	let id = baseId || "section";
	let index = 2;
	while (usedIds.has(id)) {
		id = `${baseId}-${index}`;
		index += 1;
	}
	usedIds.add(id);
	return id;
}

function stripHtml(value: string) {
	return value.replace(/<[^>]*>/g, "");
}

function decodeHtmlEntities(value: string) {
	return value
		.replace(/&amp;/g, "&")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/&nbsp;/g, " ")
		.replace(/&#(\d+);/g, (_match, value) =>
			String.fromCodePoint(Number(value))
		)
		.replace(/&#x([0-9a-f]+);/gi, (_match, value) =>
			String.fromCodePoint(Number.parseInt(value, 16))
		);
}

function slugifyHeading(value: string) {
	return value
		.toLowerCase()
		.replaceAll(" ", "-")
		.replaceAll("/", "")
		.replace("#", "")
		.replaceAll("(", "")
		.replaceAll(")", "")
		.replaceAll("?", "")
		.replaceAll(".", "")
		.replaceAll("@", "")
		.replaceAll("<", "")
		.replaceAll(">", "")
		.replaceAll("&", "")
		.replaceAll(
			/([\uE000-\uF8FF]|\uD83C[\uDF00-\uDFFF]|\uD83D[\uDC00-\uDDFF])/g,
			""
		)
		.replaceAll("✂", "")
		.replaceAll(":", "")
		.replaceAll("'", "");
}

function getPageNeighbors(pages: Record<string, string>, currentRoute: string) {
	const routes = Object.entries(pages)
		.filter(([route, source]) => !isExternalPage(source, route))
		.map(([route]) => route);
	const currentIndex = routes.indexOf(currentRoute);

	return {
		prevRoute: currentIndex > 0 ? routes[currentIndex - 1] : undefined,
		nextRoute:
			currentIndex >= 0 && currentIndex < routes.length - 1
				? routes[currentIndex + 1]
				: undefined,
	};
}

function buildMirrorMarkdown(spec: MirrorSpec, exampleMarkdown: string) {
	const cleaned = stripLeadingMarkdownH1(stripFrontmatterBlock(exampleMarkdown));
	return [
		"---",
		`og:title: ${spec.ogTitle}`,
		`og:description: ${spec.ogDescription}`,
		`og:image: ${spec.ogImage}`,
		`twitter:image: ${spec.ogImage}`,
		`description: ${spec.ogDescription}`,
		"---",
		"",
		`# ${spec.ogTitle}`,
		"",
		`![${spec.heroImageAlt}](${spec.heroImage})`,
		"",
		spec.pitch,
		"",
		"---",
		"",
		"> [!NOTE]",
		`> This example is mirrored from the official TanStack example in the [${spec.sourceLabel}](${spec.sourceUrl}) repository.`,
		"",
		cleaned,
		"",
	].join("\n");
}

function stripFrontmatterBlock(markdown: string) {
	if (!markdown.startsWith("---")) return markdown;
	const end = markdown.indexOf("\n---", 3);
	if (end === -1) return markdown;
	return markdown.slice(end + 4).trimStart();
}

function stripLeadingMarkdownH1(markdown: string) {
	const lines = markdown.split(/\r?\n/);
	let index = 0;
	while (index < lines.length) {
		const line = lines[index];
		if (line === undefined || line.trim() !== "") break;
		index += 1;
	}
	const firstContentLine = lines[index];
	if (firstContentLine !== undefined && firstContentLine.startsWith("# ")) {
		lines.splice(index, 1);
	}
	return lines.join("\n").trimStart();
}

export function canonicalUrlForPath(path: string) {
	const normalized = normalizeRoute(path);
	return `${SITE_URL}${normalized === "/" ? "" : normalized}`;
}
