import { parse } from "@opral/markdown-wc";
import { notFound } from "@tanstack/react-router";
import authorsJson from "../../../blog/authors.json";
import tocJson from "../../../blog/table_of_contents.json";
import { SITE_NAME, SITE_URL } from "../site";
import {
	extractMarkdownDescription,
	extractMarkdownH1,
} from "../docs/seo";
import { rewriteOldMarketplaceUrl } from "../docs/data";

const blogMarkdownFiles = import.meta.glob<string>("../../../blog/**/*.md", {
	query: "?raw",
	import: "default",
});

const blogRootPrefix = "../../../blog/";
const blogOgImage =
	"https://raw.githubusercontent.com/opral/paraglide-js/refs/heads/main/assets/og.png";

type BlogTocEntry = {
	path: string;
	slug: string;
	date?: string;
	authors?: string[];
};

export type BlogAuthor = {
	name: string;
	role?: string;
	avatar?: string | null;
	twitter?: string;
	github?: string;
};

export type BlogPostSummary = {
	slug: string;
	title: string;
	description: string;
	date?: string;
	authors?: BlogAuthor[];
	ogImage?: string;
};

export type BlogPostData = BlogPostSummary & {
	html: string;
	readingTime: number;
	ogImageAlt?: string;
	imports?: string[];
	prevPost?: Pick<BlogPostSummary, "slug" | "title">;
	nextPost?: Pick<BlogPostSummary, "slug" | "title">;
};

type Frontmatter = Record<string, unknown> | undefined;

const toc = tocJson as BlogTocEntry[];
const authorsMap = authorsJson as Record<string, BlogAuthor>;

export async function loadBlogIndex() {
	const posts = await Promise.all(toc.map(loadBlogSummary));
	posts.sort(comparePostsNewestFirst);
	return { posts };
}

export async function loadBlogPost(slug: string) {
	const sortedToc = [...toc].sort(compareEntriesNewestFirst);
	const currentIndex = sortedToc.findIndex((item) => item.slug === slug);
	const entry = sortedToc[currentIndex];
	if (!entry) throw notFound();

	const rawMarkdown = await loadBlogMarkdown(entry.path);
	const parsed = await parse(rawMarkdown, {
		assetBaseUrl: `/blog/${entry.slug}/`,
	});
	const title = getBlogTitle(rawMarkdown, parsed.frontmatter) ?? entry.slug;
	const description =
		getBlogDescription(rawMarkdown, parsed.frontmatter) ??
		"Updates and technical notes from the Paraglide JS team.";
	const ogImage = getBlogOgImage(parsed.frontmatter, entry.slug);
	const ogImageAlt =
		typeof parsed.frontmatter?.["og:image:alt"] === "string"
			? parsed.frontmatter["og:image:alt"]
			: undefined;
	const imports = parsed.frontmatter?.imports as string[] | undefined;

	const prevEntry = currentIndex > 0 ? sortedToc[currentIndex - 1] : undefined;
	const nextEntry =
		currentIndex < sortedToc.length - 1 ? sortedToc[currentIndex + 1] : undefined;

	return {
		slug: entry.slug,
		title,
		description,
		date: entry.date,
		authors: resolveAuthors(entry),
		readingTime: calculateReadingTime(rawMarkdown),
		ogImage,
		ogImageAlt,
		imports,
		html: rewriteBlogHtmlLinks(parsed.html),
		prevPost: prevEntry ? await loadBlogNavPost(prevEntry) : undefined,
		nextPost: nextEntry ? await loadBlogNavPost(nextEntry) : undefined,
	} satisfies BlogPostData;
}

export function getBlogStaticPaths() {
	return ["/blog", ...toc.map((entry) => `/blog/${entry.slug}`)];
}

export function blogCanonicalUrl(slug?: string) {
	return `${SITE_URL}/blog${slug ? `/${slug}` : ""}`;
}

export function buildBlogIndexHead() {
	const title = `Blog | ${SITE_NAME}`;
	const description =
		"Updates, technical notes, and implementation guides for Paraglide JS.";
	const canonicalUrl = blogCanonicalUrl();
	return {
		links: [{ rel: "canonical", href: canonicalUrl }],
		meta: [
			{ title },
			{ name: "description", content: description },
			{ property: "og:title", content: title },
			{ property: "og:description", content: description },
			{ property: "og:url", content: canonicalUrl },
			{ property: "og:type", content: "website" },
			{ property: "og:site_name", content: SITE_NAME },
			{ property: "og:locale", content: "en_US" },
			{ property: "og:image", content: blogOgImage },
			{ name: "twitter:card", content: "summary_large_image" },
			{ name: "twitter:image", content: blogOgImage },
			{ name: "twitter:title", content: title },
			{ name: "twitter:description", content: description },
		],
		scripts: [
			{
				type: "application/ld+json",
				children: JSON.stringify({
					"@context": "https://schema.org",
					"@type": "Blog",
					name: title,
					description,
					url: canonicalUrl,
				}),
			},
		],
	};
}

export function buildBlogPostHead(post?: BlogPostData) {
	if (!post) return buildBlogIndexHead();
	const title = `${post.title} | ${SITE_NAME} Blog`;
	const canonicalUrl = blogCanonicalUrl(post.slug);
	const image = absolutizeBlogUrl(post.ogImage ?? blogOgImage);
	const links = [{ rel: "canonical", href: canonicalUrl }];
	if (post.prevPost) {
		links.push({ rel: "prev", href: blogCanonicalUrl(post.prevPost.slug) });
	}
	if (post.nextPost) {
		links.push({ rel: "next", href: blogCanonicalUrl(post.nextPost.slug) });
	}

	return {
		links,
		meta: [
			{ title },
			{ name: "description", content: post.description },
			{ property: "og:title", content: title },
			{ property: "og:description", content: post.description },
			{ property: "og:url", content: canonicalUrl },
			{ property: "og:type", content: "article" },
			{ property: "og:site_name", content: SITE_NAME },
			{ property: "og:locale", content: "en_US" },
			{ property: "og:image", content: image },
			{ name: "twitter:card", content: "summary_large_image" },
			{ name: "twitter:image", content: image },
			{ name: "twitter:image:alt", content: post.ogImageAlt ?? `${post.title} cover` },
			{ name: "twitter:title", content: title },
			{ name: "twitter:description", content: post.description },
			...(post.date ? [{ property: "article:published_time", content: post.date }] : []),
			...(post.authors ?? []).map((author) => ({
				property: "article:author",
				content: author.name,
			})),
		],
		scripts: [
			{
				type: "application/ld+json",
				children: JSON.stringify({
					"@context": "https://schema.org",
					"@type": "BlogPosting",
					headline: post.title,
					description: post.description,
					url: canonicalUrl,
					image,
					...(post.date ? { datePublished: post.date } : {}),
					...(post.authors
						? {
								author: post.authors.map((author) => ({
									"@type": "Person",
									name: author.name,
									...(author.avatar ? { image: author.avatar } : {}),
									...(author.twitter || author.github
										? {
												sameAs: [author.twitter, author.github].filter(Boolean),
											}
										: {}),
								})),
							}
						: {}),
				}),
			},
		],
	};
}

async function loadBlogSummary(entry: BlogTocEntry) {
	const rawMarkdown = await loadBlogMarkdown(entry.path);
	const parsed = await parse(rawMarkdown);
	return {
		slug: entry.slug,
		title: getBlogTitle(rawMarkdown, parsed.frontmatter) ?? entry.slug,
		description:
			getBlogDescription(rawMarkdown, parsed.frontmatter) ??
			"Updates and technical notes from the Paraglide JS team.",
		date: entry.date,
		authors: resolveAuthors(entry),
		ogImage: getBlogOgImage(parsed.frontmatter, entry.slug),
	} satisfies BlogPostSummary;
}

async function loadBlogNavPost(entry: BlogTocEntry) {
	const rawMarkdown = await loadBlogMarkdown(entry.path);
	const parsed = await parse(rawMarkdown);
	return {
		slug: entry.slug,
		title: getBlogTitle(rawMarkdown, parsed.frontmatter) ?? entry.slug,
	};
}

async function loadBlogMarkdown(relativePath: string) {
	const normalized = relativePath.replace(/^[./]+/, "");
	const loader = blogMarkdownFiles[`${blogRootPrefix}${normalized}`];
	if (!loader) throw new Error(`Missing blog markdown: ${relativePath}`);
	return loader();
}

function getBlogTitle(rawMarkdown: string, frontmatter: Frontmatter) {
	const ogTitle =
		typeof frontmatter?.["og:title"] === "string"
			? frontmatter["og:title"]
			: undefined;
	return ogTitle || extractMarkdownH1(rawMarkdown);
}

function getBlogDescription(rawMarkdown: string, frontmatter: Frontmatter) {
	const ogDescription =
		typeof frontmatter?.["og:description"] === "string"
			? frontmatter["og:description"]
			: undefined;
	return ogDescription || extractMarkdownDescription(rawMarkdown);
}

function getBlogOgImage(frontmatter: Frontmatter, slug: string) {
	const value =
		typeof frontmatter?.["og:image"] === "string"
			? frontmatter["og:image"]
			: undefined;
	if (!value) return undefined;
	if (/^[a-z][a-z0-9+.-]*:/.test(value)) return value;
	return `/blog/${slug}/${value.replace(/^[./]+/, "")}`;
}

function absolutizeBlogUrl(value: string) {
	return new URL(value, SITE_URL).toString();
}

function resolveAuthors(entry: BlogTocEntry) {
	return entry.authors
		?.map((authorId) => authorsMap[authorId])
		.filter((author): author is BlogAuthor => Boolean(author));
}

function calculateReadingTime(text: string) {
	const words = text.trim().split(/\s+/).length;
	return Math.max(1, Math.ceil(words / 200));
}

function comparePostsNewestFirst(a: BlogPostSummary, b: BlogPostSummary) {
	return compareDatesNewestFirst(a.date, b.date);
}

function compareEntriesNewestFirst(a: BlogTocEntry, b: BlogTocEntry) {
	return compareDatesNewestFirst(a.date, b.date);
}

function compareDatesNewestFirst(a?: string, b?: string) {
	if (!a && !b) return 0;
	if (!a) return 1;
	if (!b) return -1;
	return new Date(b).getTime() - new Date(a).getTime();
}

function rewriteBlogHtmlLinks(html: string) {
	return html.replace(/href=(["'])([^"']+)\1/gi, (match, quote, href) => {
		const value = String(href);
		const docsUrl = rewriteOldMarketplaceUrl(value);
		if (docsUrl !== value) return `href=${quote}${docsUrl}${quote}`;
		if (value.startsWith("https://inlang.com/blog/")) {
			const slug = value.split("/blog/")[1]?.replace(/\/$/, "");
			if (slug && toc.some((entry) => entry.slug === slug)) {
				return `href=${quote}/blog/${slug}${quote}`;
			}
		}
		if (value.startsWith("/blog/")) {
			const slug = value.slice("/blog/".length).replace(/\/$/, "");
			if (!toc.some((entry) => entry.slug === slug)) {
				return `href=${quote}https://inlang.com${value}${quote}`;
			}
		}
		return match;
	});
}
