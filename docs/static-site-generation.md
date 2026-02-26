---
title: Static Site Generation (SSG)
description: Generate localized static pages at build time with Paraglide JS.
---

# Static Site Generation (SSG)

With SSG, localized pages are generated at build time rather than per-request. This requires informing your framework about which locale variants to generate and explicitly setting the locale before each page renders.

> [!IMPORTANT]
> SSG doesn't use `paraglideMiddleware()` since there's no request to handle. You must set the locale programmatically during the build using `setLocale()` or `overwriteGetLocale()`.
>
> - **`setLocale()`** - Use for synchronous builds where pages render one at a time
> - **`overwriteGetLocale()`** - Use for concurrent rendering (React) where multiple pages may build simultaneously

## Why locale must be set explicitly

In SSR, the middleware extracts the locale from the incoming request URL. In SSG, there's no request - pages are rendered at build time. The Paraglide runtime can't read `window.location` because there's no browser. You must tell Paraglide which locale to use before rendering each page.

> [!NOTE]
> SSG typically requires **all locales to have URL prefixes** (e.g., `/en/about`, `/de/about`) so each locale generates a separate static file. Unlike SSR where `/about` can serve different locales dynamically, SSG needs distinct file paths. See [URL Configuration](#url-configuration) below.

## Page Discovery

Frameworks need to know which pages to generate for each locale. Use `generateStaticLocalizedUrls()` to get all localized URLs from your patterns:

```ts
import { generateStaticLocalizedUrls } from "./paraglide/runtime.js";

const localizedUrls = generateStaticLocalizedUrls([
  "/",
  "/about",
  "/blog",
  "/blog/post-1",
  "/blog/post-2",
]);

console.log(localizedUrls);
// [
//   "/en/", "/de/",
//   "/en/about", "/de/about",
//   "/en/blog", "/de/blog",
//   "/en/blog/post-1", "/de/blog/post-1",
//   "/en/blog/post-2", "/de/blog/post-2"
// ]
```

This is also useful for sitemap generation and `<link rel="alternate" hreflang>` tags.

### Framework Examples

#### SvelteKit (entries)

Use the `entries` export to tell SvelteKit which pages to prerender. This example uses a required `[locale]` parameter (all pages have a locale prefix like `/en/about`):

```
src/routes/
  [locale]/
    +page.svelte
    +page.ts
    about/
      +page.svelte
```

```ts
// src/routes/[locale]/+page.ts
import { locales } from "$paraglide/runtime.js";

export const prerender = true;

export function entries() {
  return locales.map((locale) => ({ locale }));
}
```

For dynamic routes, enumerate all locale and slug combinations:

```ts
// src/routes/[locale]/blog/[slug]/+page.ts
import { locales } from "$paraglide/runtime.js";

export const prerender = true;

export async function entries() {
  const posts = await getPosts(); // Your data fetching

  // Generate all locale + slug combinations
  return locales.flatMap((locale) =>
    posts.map((post) => ({ locale, slug: post.slug }))
  );
}
```

#### Next.js (generateStaticParams)

```tsx
// app/[locale]/page.tsx
import { locales } from "@/paraglide/runtime.js";

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}
```

> [!TIP]
> Configure a path alias like `@/paraglide` in your `tsconfig.json` to avoid fragile relative imports.

#### Astro (getStaticPaths)

```ts
// src/pages/[locale]/index.astro
import { locales } from "../paraglide/runtime.js";

export function getStaticPaths() {
  return locales.map((locale) => ({
    params: { locale },
  }));
}
```

### Invisible Anchor Tags

For frameworks that crawl your site to discover pages, add hidden anchor tags that link to each locale variant of the current page:

```tsx
import { localizeHref, locales } from "@/paraglide/runtime.js";

function CrawlerLinks({ currentPath }: { currentPath: string }) {
  return (
    <nav aria-hidden="true" style={{ display: "none" }}>
      {locales.map((locale) => (
        <a key={locale} href={localizeHref(currentPath, { locale })}>
          {locale}
        </a>
      ))}
    </nav>
  );
}
```

The crawler will follow these links and generate pages for each locale.

## Setting the Locale

### Astro (Middleware)

The recommended approach for Astro SSG is middleware that sets the locale before each page renders:

```ts
// src/middleware.ts
import { defineMiddleware } from "astro:middleware";
import { setLocale, assertIsLocale } from "./paraglide/runtime.js";

export const onRequest = defineMiddleware((context, next) => {
  if (context.currentLocale) {
    setLocale(assertIsLocale(context.currentLocale));
  }
  return next();
});
```

Make sure your `astro.config.mjs` has i18n configured with the same locales defined in your `project.inlang`:

```js
export default defineConfig({
  output: "static",
  i18n: {
    defaultLocale: "en",
    locales: ["en", "de", "fr"], // Must match your project.inlang locales
  },
});
```

### Next.js SSG

Use `overwriteGetLocale` with React's `cache` to scope the locale per page during build:

```tsx
// app/[locale]/layout.tsx
import { cache } from "react";
import {
  getLocale,
  getTextDirection,
  overwriteGetLocale,
  baseLocale,
  assertIsLocale,
} from "@/paraglide/runtime.js";

const ssrLocale = cache(() => ({
  locale: baseLocale,
}));

overwriteGetLocale(() => assertIsLocale(ssrLocale().locale));

export default function RootLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { locale: string };
}) {
  ssrLocale().locale = params.locale;
  return (
    <html lang={getLocale()} dir={getTextDirection()}>
      <body>{children}</body>
    </html>
  );
}
```

### SvelteKit

Set the locale in your layout's `load` function:

```ts
// src/routes/[locale]/+layout.ts
import { setLocale, assertIsLocale } from "$paraglide/runtime.js";

export function load({ params }) {
  setLocale(assertIsLocale(params.locale));
}
```

## URL Configuration

SSG typically requires all locales to have a URL prefix so each locale generates a separate file:

```js
compile({
  project: "./project.inlang",
  outdir: "./src/paraglide",
  strategy: ["url", "baseLocale"],
  urlPatterns: [
    {
      pattern: "/:path(.*)?",
      localized: [
        ["en", "/en/:path(.*)?"],
        ["de", "/de/:path(.*)?"],
      ],
    },
  ],
});
```

This ensures `localizeHref()` generates prefixed paths like `/en/about` and `/de/about` that map to separate static files.

## SEO: Hreflang Tags

For SEO, add `<link rel="alternate" hreflang>` tags to help search engines understand your localized pages:

```tsx
import { localizeHref, locales, baseLocale } from "@/paraglide/runtime.js";

function HreflangTags({ currentPath }: { currentPath: string }) {
  return (
    <>
      {locales.map((locale) => (
        <link
          key={locale}
          rel="alternate"
          hrefLang={locale}
          href={localizeHref(currentPath, { locale })}
        />
      ))}
      <link
        rel="alternate"
        hrefLang="x-default"
        href={localizeHref(currentPath, { locale: baseLocale })}
      />
    </>
  );
}
```

Using `localizeHref` ensures each locale is explicitly mapped to its correct URL, regardless of your URL pattern configuration.

## Incremental Static Regeneration (ISR)

Frameworks like Next.js support ISR, which regenerates static pages on-demand after deployment. Paraglide works with ISR - treat it like SSG during the regeneration phase. The same locale-setting patterns apply: use `overwriteGetLocale()` in Next.js to ensure the locale is correctly scoped during regeneration.

## See Also

- [Server-Side Rendering](./server-side-rendering) - Dynamic rendering with middleware
- [i18n Routing](./i18n-routing) - URL patterns, translated pathnames, domain-based routing
- [Strategy Configuration](./strategy) - Configure locale detection strategies
