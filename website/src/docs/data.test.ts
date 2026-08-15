import { describe, expect, it } from "vitest";
import {
	canonicalUrlForPath,
	extractHeadingsAndInjectIds,
	flattenManifestPages,
	formatNavTitle,
	getDocsSections,
	normalizeMarkdownAlerts,
	resolveHtmlLinks,
	resolveRelativeUrl,
	rewriteOldMarketplaceUrl,
} from "./data";

describe("Paraglide docs data helpers", () => {
	it("flattens manifest pages to standalone routes", () => {
		const pages = flattenManifestPages();

		expect(pages["/"]).toBe("./README.md");
		expect(pages["/react-router"]).toBe("./examples/react-router/README.md");
		expect(pages["/server-side-rendering"]).toBe(
			"./docs/server-side-rendering.md"
		);
	});

	it("builds sectioned navigation from the manifest", () => {
		const sections = getDocsSections();

		expect(sections[0]?.title).toBe("Overview");
		expect(sections.some((section) => section.title === "Getting Started")).toBe(
			true
		);
		expect(
			sections
				.flatMap((section) => section.pages)
				.some((page) => page.route === "/tanstack-start" && !page.isExternal)
		).toBe(true);
	});

	it("rewrites old marketplace links to standalone URLs", () => {
		expect(
			rewriteOldMarketplaceUrl(
				"https://inlang.com/m/gerre34r/library-inlang-paraglideJs"
			)
		).toBe("/");
		expect(
			rewriteOldMarketplaceUrl(
				"https://inlang.com/m/gerre34r/library-inlang-paraglideJs/sveltekit"
			)
		).toBe("/sveltekit");
		expect(
			rewriteOldMarketplaceUrl(
				"/m/gerre34r/library-inlang-paraglideJs/server-side-rendering"
			)
		).toBe("/server-side-rendering");
		expect(
			rewriteOldMarketplaceUrl(
				"https://inlang.com/m/gerre34r/library-inlang-paraglideJs/next"
			)
		).toBe("/next-js");
	});

	it("resolves relative raw github markdown links with markdown extension", () => {
		const resolved = resolveRelativeUrl(
			"./middleware#setup",
			"https://raw.githubusercontent.com/opral/paraglide-js/refs/heads/main/docs/strategy.md",
			{ appendMarkdownExtension: true }
		);

		expect(resolved).toBe(
			"https://raw.githubusercontent.com/opral/paraglide-js/refs/heads/main/docs/middleware.md#setup"
		);
	});

	it("rewrites known page links while preserving hash suffixes", () => {
		const html = '<p><a href="./middleware#setup">Middleware</a></p>';
		const pageLinkMap = new Map([
			[
				"https://raw.githubusercontent.com/opral/paraglide-js/refs/heads/main/docs/middleware.md",
				"/middleware",
			],
		]);

		const resolved = resolveHtmlLinks(
			html,
			"https://raw.githubusercontent.com/opral/paraglide-js/refs/heads/main/docs/strategy.md",
			pageLinkMap
		);

		expect(resolved).toContain('href="/middleware#setup"');
	});

	it("rewrites old marketplace bare URL link text", () => {
		const resolved = resolveHtmlLinks(
			'<p><a href="https://inlang.com/m/gerre34r/library-inlang-paraglideJs/server">https://inlang.com/m/gerre34r/library-inlang-paraglideJs/server</a></p>',
			"https://raw.githubusercontent.com/opral/paraglide-js/refs/heads/main/docs-api/server/type/-internal-.md"
		);

		expect(resolved).toContain('href="/server"');
		expect(resolved).toContain(">/server<");
		expect(resolved).not.toContain("https://inlang.com/m/gerre34r");
	});

	it("rewrites moved standalone docs and API page aliases", () => {
		const pageLinkMap = new Map([
			[
				"https://raw.githubusercontent.com/opral/paraglide-js/refs/heads/main/docs/compiler-options.md",
				"/compiler-options",
			],
			[
				"https://raw.githubusercontent.com/opral/paraglide-js/refs/heads/main/docs/standalone-servers.md",
				"/standalone-servers",
			],
			[
				"https://raw.githubusercontent.com/opral/paraglide-js/refs/heads/main/docs-api/runtime/type/README.md",
				"/runtime",
			],
		]);

		expect(
			resolveHtmlLinks(
				'<a href="./compiler-options">Compiler Options</a>',
				"https://raw.githubusercontent.com/opral/paraglide-js/refs/heads/main/docs/compiling-messages.md",
				pageLinkMap
			)
		).toContain('href="/compiler-options"');
		expect(
			resolveHtmlLinks(
				'<a href="./standalone-servers">Standalone Servers</a>',
				"https://raw.githubusercontent.com/opral/paraglide-js/refs/heads/main/docs/compiling-messages.md",
				pageLinkMap
			)
		).toContain('href="/standalone-servers"');
		expect(
			resolveHtmlLinks(
				'<a href="runtime/type/README.md#runtime">Runtime</a>',
				"https://raw.githubusercontent.com/opral/paraglide-js/refs/heads/main/docs-api/compiler-options.md",
				pageLinkMap
			)
		).toContain('href="/runtime#runtime"');
	});

	it("keeps injected heading ids and self-links in sync", () => {
		const { html, headings } = extractHeadingsAndInjectIds(
			'<h2 id="patch-changes"><a href="#patch-changes">Patch Changes</a></h2><h2 id="patch-changes-1"><a href="#patch-changes-1">Patch Changes</a></h2>'
		);

		expect(headings.map((heading) => heading.id)).toEqual([
			"patch-changes",
			"patch-changes-2",
		]);
		expect(html).toContain('id="patch-changes-2"');
		expect(html).toContain('href="#patch-changes-2"');
	});

	it("decodes numeric HTML entities in heading text before slugging", () => {
		const { headings } = extractHeadingsAndInjectIds(
			'<h2 id="x"><a href="#x">resolve args &#x3C;Promise&#x26;Response&#x3E;</a></h2>'
		);

		expect(headings[0]).toMatchObject({
			text: "resolve args <Promise&Response>",
			id: "resolve-args-promiseresponse",
		});
	});

	it("normalizes GitHub-style markdown alerts", () => {
		const html = normalizeMarkdownAlerts(
			"<blockquote><p>[!NOTE] Please open a pull request.</p></blockquote>"
		);

		expect(html).toContain('data-mwc-alert="note"');
		expect(html).toContain("Please open a pull request.");
		expect(html).toContain("data-mwc-alert-marker");
	});

	it("formats important route titles", () => {
		expect(formatNavTitle("sveltekit")).toBe("SvelteKit");
		expect(formatNavTitle("i18n-routing")).toBe("i18n Routing");
		expect(formatNavTitle("server-side-rendering")).toBe("Server Side Rendering");
	});

	it("builds canonical URLs on the new domain", () => {
		expect(canonicalUrlForPath("/")).toBe("https://paraglidejs.com");
		expect(canonicalUrlForPath("/react-router")).toBe(
			"https://paraglidejs.com/react-router"
		);
	});
});
