import { describe, expect, it } from "vitest";
import {
	buildTitle,
	deriveTitleFromPath,
	extractMarkdownDescription,
	extractMarkdownH1,
	getDescription,
	getSubpageTitle,
} from "./seo";

describe("Paraglide docs SEO helpers", () => {
	it("uses the product name for the root title", () => {
		expect(buildTitle({ pagePath: "/", rawMarkdown: "# Paraglide JS" })).toBe(
			"Paraglide JS"
		);
	});

	it("uses subpage titles for nested docs", () => {
		expect(
			buildTitle({
				pagePath: "/react-router",
				rawMarkdown: "# React Router\n\nContent",
			})
		).toBe("Paraglide JS - React Router");
	});

	it("prefers frontmatter title over h1", () => {
		expect(
			getSubpageTitle({
				pagePath: "/tanstack-start",
				rawMarkdown: "# Example",
				frontmatter: { "og:title": "Paraglide JS for TanStack Start" },
			})
		).toBe("Paraglide JS for TanStack Start");
	});

	it("extracts h1 after frontmatter", () => {
		expect(
			extractMarkdownH1(`---
description: Test
---

# Middleware
`)
		).toBe("Middleware");
	});

	it("extracts the first useful paragraph", () => {
		expect(
			extractMarkdownDescription(`# Title

First line.
Second line.

## Next
`)
		).toBe("First line. Second line.");
	});

	it("falls back to manifest description", () => {
		expect(getDescription({ pagePath: "/other", rawMarkdown: "# Title" })).toContain(
			"i18n"
		);
	});

	it("uses product copy for the homepage description instead of badge markdown", () => {
		expect(
			getDescription({
				pagePath: "/",
				rawMarkdown: "[![NPM Downloads](https://example.com)](https://example.com)",
			})
		).toContain("Compiler-first i18n");
	});

	it("uses route-specific descriptions for API reference pages", () => {
		expect(getDescription({ pagePath: "/runtime", rawMarkdown: "# Runtime" })).toContain(
			"Runtime API reference"
		);
	});

	it("derives readable titles from paths", () => {
		expect(deriveTitleFromPath("/next-js")).toBe("Next.js");
		expect(deriveTitleFromPath("/i18n-routing")).toBe("i18n Routing");
	});
});
