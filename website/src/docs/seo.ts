import manifest from "../../../marketplace-manifest.json";
import { GITHUB_REPOSITORY, SITE_NAME, SITE_URL } from "../site";
import type { DocsPageData } from "./data";
import { canonicalUrlForPath, formatNavTitle } from "./data";

const PRODUCT_DESCRIPTION =
	"Compiler-first i18n for TanStack Start, SvelteKit, Vite, React Router, Next.js, Astro, and vanilla JavaScript or TypeScript apps.";
const DEFAULT_OG_IMAGE =
	"https://raw.githubusercontent.com/opral/paraglide-js/refs/heads/main/assets/og.png";

type HeadInput = {
	pagePath: string;
	rawMarkdown: string;
	frontmatter?: Record<string, {}>;
};

export function buildPageHead(data: DocsPageData) {
	const pageTitle = buildTitle(data);
	const description = getDescription(data);
	const canonicalUrl = canonicalUrlForPath(data.pagePath);
	const image = getImage(data);
	const subpageTitle = getSubpageTitle(data);
	const links = [{ rel: "canonical", href: canonicalUrl }];

	if (data.prevPagePath) {
		links.push({ rel: "prev", href: canonicalUrlForPath(data.prevPagePath) });
	}
	if (data.nextPagePath) {
		links.push({ rel: "next", href: canonicalUrlForPath(data.nextPagePath) });
	}

	return {
		links,
		scripts: [
			{
				type: "application/ld+json",
				children: JSON.stringify(buildWebPageJsonLd(pageTitle, description, canonicalUrl, image)),
			},
			{
				type: "application/ld+json",
				children: JSON.stringify(buildBreadcrumbJsonLd(data, canonicalUrl, subpageTitle)),
			},
			{
				type: "application/ld+json",
				children: JSON.stringify(buildSoftwareJsonLd()),
			},
			...(subpageTitle
				? [
						{
							type: "application/ld+json",
							children: JSON.stringify(
								buildArticleJsonLd(subpageTitle, description, canonicalUrl, image)
							),
						},
					]
				: []),
		],
		meta: [
			{ title: pageTitle },
			{ name: "description", content: description },
			{ property: "og:title", content: pageTitle },
			{ property: "og:description", content: description },
			{ property: "og:url", content: canonicalUrl },
			{ property: "og:type", content: subpageTitle ? "article" : "website" },
			{ property: "og:site_name", content: SITE_NAME },
			{ property: "og:locale", content: "en_US" },
			{ property: "og:image", content: image },
			{ name: "twitter:card", content: "summary_large_image" },
			{ name: "twitter:image", content: image },
			{
				name: "twitter:image:alt",
				content: "Paraglide JS compiler-first i18n documentation.",
			},
			{ name: "twitter:title", content: pageTitle },
			{ name: "twitter:description", content: description },
			{ name: "twitter:site", content: "@inlangHQ" },
			{ name: "twitter:creator", content: "@inlangHQ" },
			...extractOgMeta(data.frontmatter),
			...extractTwitterMeta(data.frontmatter),
		],
	};
}

export function buildTitle(input: HeadInput) {
	const subpageTitle = getSubpageTitle(input);
	if (subpageTitle) {
		return subpageTitle.startsWith(SITE_NAME)
			? subpageTitle
			: `${SITE_NAME} - ${subpageTitle}`;
	}
	return SITE_NAME;
}

export function getSubpageTitle(input: HeadInput) {
	if (input.pagePath === "/") return undefined;
	const ogTitle =
		typeof input.frontmatter?.["og:title"] === "string"
			? input.frontmatter["og:title"]
			: undefined;
	if (ogTitle) return ogTitle;
	const h1 = extractMarkdownH1(input.rawMarkdown);
	if (h1) return h1;
	return deriveTitleFromPath(input.pagePath);
}

export function getDescription(input: HeadInput) {
	if (input.pagePath === "/") return PRODUCT_DESCRIPTION;
	const routeDescription = getRouteDescription(input.pagePath);
	if (routeDescription) return routeDescription;
	return (
		(typeof input.frontmatter?.description === "string"
			? input.frontmatter.description
			: undefined) ||
		extractMarkdownDescription(input.rawMarkdown) ||
		(typeof manifest.description === "object"
			? manifest.description.en
			: manifest.description)
	);
}

export function extractOgMeta(frontmatter?: Record<string, {}>) {
	if (!frontmatter) return [];
	const handledKeys = new Set(["og:title", "og:description", "og:url", "og:type", "og:site_name", "og:locale", "og:image"]);
	return Object.entries(frontmatter)
		.filter(
			([key, value]) =>
				key.startsWith("og:") &&
				!handledKeys.has(key) &&
				typeof value === "string"
		)
		.map(([key, value]) => ({
			property: key,
			content: value as string,
		}));
}

export function extractTwitterMeta(frontmatter?: Record<string, {}>) {
	if (!frontmatter) return [];
	return Object.entries(frontmatter)
		.filter(([key, value]) => key.startsWith("twitter:") && typeof value === "string")
		.map(([key, value]) => ({
			name: key,
			content: value as string,
		}));
}

export function extractMarkdownH1(markdown: string) {
	const sanitized = stripFrontmatter(markdown);
	const lines = sanitized.split(/\r?\n/);
	for (const line of lines) {
		if (line.startsWith("# ")) return line.slice(2).trim() || undefined;
	}
	return undefined;
}

export function extractMarkdownDescription(markdown: string) {
	const sanitized = stripFrontmatter(markdown);
	const lines = sanitized.split(/\r?\n/);
	let collecting = false;
	const paragraph: string[] = [];

	for (const line of lines) {
		const trimmed = line.trim();
		if (!trimmed) {
			if (collecting) break;
			continue;
		}
		if (trimmed.startsWith("#")) continue;
		if (trimmed.startsWith("![")) continue;
		if (
			trimmed.startsWith("- ") ||
			trimmed.startsWith("* ") ||
			/^\d+\.\s/.test(trimmed)
		) {
			continue;
		}
		if (/^<p align="center">/.test(trimmed)) continue;
		collecting = true;
		paragraph.push(trimmed.replace(/<[^>]*>/g, ""));
	}

	return paragraph.length ? paragraph.join(" ") : undefined;
}

export function deriveTitleFromPath(path: string) {
	const segment = path.split("/").filter(Boolean).at(-1);
	return segment ? formatNavTitle(segment) : undefined;
}

function stripFrontmatter(markdown: string) {
	if (!markdown.startsWith("---")) return markdown;
	const end = markdown.indexOf("\n---", 3);
	if (end === -1) return markdown;
	return markdown.slice(end + 4).trimStart();
}

function getImage(data: DocsPageData) {
	const frontmatterImage =
		typeof data.frontmatter?.["og:image"] === "string"
			? String(data.frontmatter["og:image"])
			: undefined;
	return (
		frontmatterImage ||
		DEFAULT_OG_IMAGE
	);
}

function getRouteDescription(pagePath: string) {
	const descriptions: Record<string, string> = {
		"/compiler-options":
			"Reference for configuring the Paraglide JS compiler and generated message output.",
		"/runtime":
			"Runtime API reference for Paraglide JS message functions, locale state, and client-side helpers.",
		"/server":
			"Server API reference for Paraglide JS SSR, middleware, and request-scoped localization helpers.",
	};
	return descriptions[pagePath];
}

function buildWebPageJsonLd(
	name: string,
	description: string,
	url: string,
	image: string
) {
	return {
		"@context": "https://schema.org",
		"@type": "WebPage",
		name,
		description,
		url,
		image,
	};
}

function buildBreadcrumbJsonLd(
	data: DocsPageData,
	canonicalUrl: string,
	subpageTitle?: string
) {
	const items: Array<Record<string, {}>> = [
		{
			"@type": "ListItem",
			position: 1,
			name: SITE_NAME,
			item: SITE_URL,
		},
	];

	if (subpageTitle) {
		items.push({
			"@type": "ListItem",
			position: 2,
			name: subpageTitle,
			item: canonicalUrl,
		});
	}

	return {
		"@context": "https://schema.org",
		"@type": "BreadcrumbList",
		itemListElement: items,
	};
}

function buildSoftwareJsonLd() {
	return {
		"@context": "https://schema.org",
		"@type": "SoftwareSourceCode",
		name: SITE_NAME,
		description: PRODUCT_DESCRIPTION,
		url: SITE_URL,
		image: DEFAULT_OG_IMAGE,
		publisher: {
			"@type": "Organization",
			name: "inlang",
			url: "https://inlang.com",
			logo: "https://inlang.com/favicon/safari-pinned-tab.svg",
		},
		license: "MIT",
		codeRepository: GITHUB_REPOSITORY,
		sameAs: [SITE_URL, GITHUB_REPOSITORY],
	};
}

function buildArticleJsonLd(
	headline: string,
	description: string,
	url: string,
	image: string
) {
	return {
		"@context": "https://schema.org",
		"@type": "Article",
		headline,
		description,
		url,
		image,
	};
}
