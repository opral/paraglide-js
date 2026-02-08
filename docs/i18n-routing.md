---
title: i18n Routing
slug: i18n-routing
description: Configure internationalized URL routing - locale prefixes, translated pathnames, domain-based localization, and URL patterns.
---

# i18n Routing

Paraglide JS provides powerful URL-based internationalized routing using the web standard [URLPattern API](https://developer.mozilla.org/en-US/docs/Web/API/URL_Pattern_API). This guide covers how to configure URL patterns for locale detection, translated pathnames, domain-based localization, and more.

i18n routing gives each locale its own URL - like `/about` for English and `/de/about` for German. This is the gold standard for internationalized websites because:

- **SEO** - Search engines index each language version separately
- **Shareability** - Users can share links in their language

> [!TIP]
> This guide focuses on URL pattern configuration. For an overview of all locale detection strategies (cookies, localStorage, headers, etc.), see the [Strategy documentation](./strategy).

## Quick Start

Add `url` to your strategy array to enable URL-based locale detection:

```js
compile({
	project: "./project.inlang",
	outdir: "./src/paraglide",
	strategy: ["url", "baseLocale"],
});
```

That's it. By default, Paraglide uses locale prefixes like `/de/about` for non-base locales while keeping the base locale unprefixed (`/about`). No `urlPatterns` configuration needed for this common setup.

Need something different? Use `urlPatterns` to customize:

- **Translated pathnames** - `/about` in English, `/ueber-uns` in German
- **Domain-based routing** - `example.com` for English, `de.example.com` for German
- **Prefix all locales** - `/en/about` and `/de/about` (including base locale)
- **Mixed patterns** - Some routes prefixed, others not

Read on to learn how URL patterns work and see configuration examples.

## Core Concepts

### How URL patterns work

Each URL pattern consists of two parts:

- **`pattern`**: The canonical route structure (e.g., `"/about"` or `"/:path(.*)?"`)
- **`localized`**: An array of tuples mapping each locale to its URL form

```js
{
  pattern: "/about",        // Canonical route
  localized: [
    ["en", "/about"],       // English: /about
    ["de", "/ueber-uns"],   // German: /ueber-uns
  ],
}
```

The tuple format is `[locale, localizedPath]`. When a user visits `/ueber-uns`, Paraglide matches it to the German locale. When you call `localizeHref("/about", { locale: "de" })`, it returns `/ueber-uns`.

**Example transformation:**

| Visited URL        | Detected Locale | Canonical Path  |
| ------------------ | --------------- | --------------- |
| `/about`           | `en`            | `/about`        |
| `/ueber-uns`       | `de`            | `/about`        |
| `/de/produkte/123` | `de`            | `/products/123` |
| `/products/123`    | `en`            | `/products/123` |

### Pattern matching order

Patterns are evaluated in array order. The first match wins, so place specific patterns before wildcards:

```js
urlPatterns: [
	{ pattern: "/blog/:id", localized: [...] },  // Specific first
	{ pattern: "/:path(.*)?", localized: [...] }, // Wildcard last
]
```

> [!TIP]
> Use https://urlpattern.com/ to test your URL patterns.

## URL Patterns Configuration

### Common patterns at a glance

| Use Case                  | Example URLs                    | Pattern                                                                                   |
| ------------------------- | ------------------------------- | ----------------------------------------------------------------------------------------- |
| Prefix non-default only   | `/about`, `/de/about`           | `["de", "/de/:path(.*)?"]`, `["en", "/:path(.*)?"]`                                       |
| Prefix all locales        | `/en/about`, `/de/about`        | `["en", "/en/:path(.*)?"]`, `["de", "/de/:path(.*)?"]`                                    |
| Translated paths          | `/about`, `/ueber-uns`          | `["en", "/about"]`, `["de", "/ueber-uns"]`                                                |
| Subdomains                | `example.com`, `de.example.com` | `["en", "https://example.com/:path(.*)?"]`, `["de", "https://de.example.com/:path(.*)?"]` |
| No prefix (cookie/header) | `/dashboard`                    | `["en", "/dashboard/:path(.*)?"]`, `["de", "/dashboard/:path(.*)?"]`                      |

*"No prefix" is useful for authenticated areas like dashboards where the URL stays the same but content is localized based on user preferences stored in cookies or headers.*

### Locale prefixing

```
https://example.com/about
https://example.com/de/about
```

```js
compile({
	project: "./project.inlang",
	outdir: "./src/paraglide",
	strategy: ["url", "cookie"],
	urlPatterns: [
		{
			pattern: "/:path(.*)?",
			localized: [
				["de", "/de/:path(.*)?"],
				// make sure to match the least specific path last
				["en", "/:path(.*)?"],
			],
		},
	],
});
```

**Why the wildcard pattern always resolves**: The pattern `/:path(.*)?` matches **any** path. When a user visits `/about` (without a locale prefix), it matches the English pattern and resolves to `en`. This is also the default behavior if you don't specify `urlPatterns` at all.

#### Prefixing all locales (SvelteKit, Next.js)

Some frameworks like SvelteKit model locale-aware routes with a required `[locale]` segment, meaning all locales need a prefix (`/en/about`, `/de/about`). To prefix the base locale too, add an explicit pattern for the root path before the wildcard:

```js
compile({
	project: "./project.inlang",
	outdir: "./src/paraglide",
	strategy: ["url", "cookie"],
	urlPatterns: [
		{
			pattern: "/",
			localized: [
				["en", "/en"],
				["fr", "/fr"],
			],
		},
		{
			pattern: "/:path(.*)?",
			localized: [
				["en", "/en/:path(.*)?"],
				["fr", "/fr/:path(.*)?"],
			],
		},
	],
});
```

The dedicated root pattern prevents redirect loops on the homepage.

### Routes without locale prefix

Some routes (like `/dashboard` or `/app`) may need i18n but shouldn't have a locale prefix in the URL. Configure these by using the same path for all locales:

```js
compile({
	project: "./project.inlang",
	outdir: "./src/paraglide",
	strategy: ["url", "cookie", "baseLocale"],
	urlPatterns: [
		// Dashboard routes - no locale prefix
		{
			pattern: "/dashboard/:path(.*)?",
			localized: [
				["en", "/dashboard/:path(.*)?"],
				["de", "/dashboard/:path(.*)?"], // Same path for all locales
			],
		},
		// Other routes - use locale prefix
		{
			pattern: "/:path(.*)?",
			localized: [
				["de", "/de/:path(.*)?"],
				["en", "/:path(.*)?"],
			],
		},
	],
});
```

With this setup:

- `/dashboard/*` URLs stay the same regardless of locale
- Locale is determined by cookie or other fallback strategies
- Other routes like `/about` use URL-based locale (`/de/about`)

> [!TIP]
> For routes that don't need i18n at all (like `/api`), bypass the middleware entirely instead. See [Excluding Routes from Middleware](./middleware#excluding-routes-from-middleware).

### Translated pathnames

For pathnames where you want to localize the structure and path segments of the URL, you can use different patterns for each locale. This approach enables language-specific routes like `/about` in English and `/ueber-uns` in German.

```
https://example.com/about
https://example.com/ueber-uns
```

Here's a simple example with translated path segments:

```js
compile({
	project: "./project.inlang",
	outdir: "./src/paraglide",
	strategy: ["url", "cookie"],
	urlPatterns: [
		// Specific translated routes
		{
			pattern: "/about",
			localized: [
				["en", "/about"],
				["de", "/ueber-uns"],
			],
		},
		{
			pattern: "/products/:id",
			localized: [
				["en", "/products/:id"],
				["de", "/produkte/:id"],
			],
		},
		// Wildcard for untranslated routes - same path for all locales
		{
			pattern: "/:path(.*)?",
			localized: [
				["en", "/:path(.*)?"],
				["de", "/:path(.*)?"],
			],
		},
	],
});
```

> [!NOTE]
> When the same path is used for all locales (like the wildcard fallback above), the URL alone can't determine the locale. Paraglide will use your fallback strategies (cookie, header, etc.) for these routes. If you need URL-based detection for all routes, use prefixed fallback patterns like `/de/:path(.*)?` instead.

### Domain-based localization

```
https://example.com/about
https://de.example.com/about
```

When using domain-based routing, you need separate patterns for localhost and production. Without a localhost pattern, your production domain pattern won't match during local development, and URL localization won't work.

```js
compile({
	project: "./project.inlang",
	outdir: "./src/paraglide",
	strategy: ["url", "cookie"],
	urlPatterns: [
		// Localhost: use path prefixes since subdomains aren't available locally
		{
			pattern: "http://localhost::port?/:path(.*)?",
			localized: [
				["en", "http://localhost::port?/en/:path(.*)?"],
				["de", "http://localhost::port?/de/:path(.*)?"],
			],
		},
		// Production: use subdomains
		{
			pattern: "https://example.com/:path(.*)?",
			localized: [
				["en", "https://example.com/:path(.*)?"],
				["de", "https://de.example.com/:path(.*)?"],
			],
		},
	],
});
```

### Adding a base path

You can add a base path to your URL patterns to support localized URLs with a common base path.

For example, with the base path set to "shop":

- `localizeHref("/about")` → `/shop/en/about`
- `deLocalizeHref("/shop/en/about")` → `/about`

The syntax `{shop/}?` is URLPattern's **optional group** syntax:

- `{...}` creates a group
- `?` makes the group optional (matches zero or one time)
- The trailing `/` is included in the group so it's only present when the base path is

This allows the pattern to match both `/about` and `/shop/about`.

```js
compile({
	project: "./project.inlang",
	outdir: "./src/paraglide",
	strategy: ["url", "cookie"],
	urlPatterns: [
		{
			pattern: "/{shop/}?:path(.*)?",
			localized: [
				["en", "/{shop/}?en/:path(.*)?"],
				["de", "/{shop/}?de/:path(.*)?"],
			],
		},
	],
});
```

| Original URL  | Localized URL (EN) | Localized URL (DE) |
| ------------- | ------------------ | ------------------ |
| `/about`      | `/shop/en/about`   | `/shop/de/about`   |
| `/shop/about` | `/shop/en/about`   | `/shop/de/about`   |

### Making URL patterns unavailable in specific locales

You can make certain routes unavailable in specific locales by mapping them to your 404 page.

```
https://example.com/specific-path       // Available in English
https://example.com/de/specific-path    // Redirects to 404 in German
```

```js
compile({
	project: "./project.inlang",
	outdir: "./src/paraglide",
	strategy: ["url", "cookie"],
	urlPatterns: [
		// Route only available in English
		{
			pattern: "/specific-path",
			localized: [
				["en", "/specific-path"],
				["de", "/de/404"], // German visitors get redirected to 404
			],
		},
		// Catch-all for other routes
		{
			pattern: "/:path(.*)?",
			localized: [
				["de", "/de/:path(.*)?"],
				["en", "/:path(.*)?"],
			],
		},
	],
});
```

When a German user visits `/specific-path`, they'll be redirected to `/de/404`. This is useful for:

- Content that only exists in certain languages
- Gradual feature rollouts by locale
- Legacy URLs from specific regions

## Real-world Examples

### Multi-tenant applications

For SaaS platforms with different domains or subdomains per customer, each needing different default locales or supported languages, see the [Multi-Tenancy Guide](./multi-tenancy).

## Client-side redirects

The server-side `paraglideMiddleware()` uses the `shouldRedirect()` helper to keep URLs and locales in sync. Single-page apps can call the same helper on the client to mirror that behaviour.

`shouldRedirect()` accepts either a `Request` (server) or a URL string (client). It evaluates your configured strategies in order, returning both the winning locale and the canonical URL.

#### Generic SPA

```ts
import { shouldRedirect } from "./paraglide/runtime.js";

async function checkRedirect() {
	const decision = await shouldRedirect({ url: window.location.href });

	if (decision.shouldRedirect) {
		window.location.href = decision.redirectUrl.href;
	}
}

// Call on route change or app init
checkRedirect();
```

#### TanStack Router

```ts
import { redirect } from "@tanstack/router";
import { shouldRedirect } from "./paraglide/runtime.js";

export const beforeLoad = async ({ location }) => {
	const decision = await shouldRedirect({ url: location.href });

	if (decision.shouldRedirect) {
		throw redirect({ to: decision.redirectUrl.href });
	}
};
```

## Troubleshooting

### Debugging URL patterns

To verify your patterns work correctly:

1. **Test patterns visually** at [urlpattern.com](https://urlpattern.com) - paste your pattern and test URLs to see what matches

2. **Log locale resolution** in your middleware:

```ts
// Add logging to your existing middleware handler
paraglideMiddleware(request, ({ request, locale }) => {
	console.log(`URL: ${request.url} → Locale: ${locale}`);
	return yourAppHandler(request); // Your existing handler
});
```

3. **Test URL helpers** - In your app code, log the output of `localizeHref()`:

```js
import { localizeHref } from "./paraglide/runtime.js";

console.log(localizeHref("/about", { locale: "de" }));
// Should log "/de/about" or "/ueber-uns" depending on your patterns
```

### Strategy order with URL wildcards

When using wildcard patterns like `/:path(.*)?` (which is the default), the URL strategy will **always** resolve to a locale. This makes it act as an "end condition" in your strategy array - any strategies placed after it will never be evaluated.

If you want to prioritize user preferences (from localStorage, cookies, etc.) over the URL, place those strategies **before** the URL strategy:

```js
// User preference is checked first
strategy: ["localStorage", "preferredLanguage", "url"];

// localStorage will never be checked because URL always resolves
strategy: ["url", "localStorage", "preferredLanguage"];
```

### Excluding paths is not supported

[URLPattern](https://developer.mozilla.org/en-US/docs/Web/API/URL_Pattern_API#regex_matchers_limitations) does not support negative lookahead regex patterns, so you cannot exclude paths like `/api/*` directly in your URL patterns.

Instead, filter routes manually in your request handler before calling the middleware. See [Excluding Routes from Middleware](./middleware#excluding-routes-from-middleware) for examples.

### Pattern order matters

URL patterns are evaluated in the order they appear in the `urlPatterns` array. The first pattern that matches a URL will be used. More specific patterns should come before general ones.

*Examples below show `urlPatterns` arrays only, omitting the `compile()` wrapper for brevity.*

```js
urlPatterns: [
	// INCORRECT ORDER: The wildcard pattern will match everything,
	// so the specific pattern will never be reached
	{
		pattern: "https://example.com/:path(.*)?", // This will match ANY path
		localized: [
			["en", "https://example.com/:path(.*)?"],
			["de", "https://example.com/de/:path(.*)?"],
		],
	},
	{
		pattern: "https://example.com/blog/:id", // This will never be reached
		localized: [
			["en", "https://example.com/blog/:id"],
			["de", "https://example.com/de/blog/:id"],
		],
	},
];

// CORRECT ORDER: Specific patterns first, then more general patterns
urlPatterns: [
	{
		pattern: "https://example.com/blog/:id", // Specific pattern first
		localized: [
			["en", "https://example.com/blog/:id"],
			["de", "https://example.com/de/blog/:id"],
		],
	},
	{
		pattern: "https://example.com/:path(.*)?", // General pattern last
		localized: [
			["en", "https://example.com/:path(.*)?"],
			["de", "https://example.com/de/:path(.*)?"],
		],
	},
];
```

### Localized pattern order matters too

Within each pattern's `localized` array, the order of locale patterns also matters. When localizing a URL, the first matching pattern for the target locale will be used. Similarly, when delocalizing a URL, patterns are checked in order.

This is especially important for path-based localization where one locale has a prefix (like `/de/`) and another doesn't. In these cases, put the more specific pattern (with prefix) first.

```js
// INCORRECT ORDER: The first pattern is too general
{
  pattern: "https://example.com/:path(.*)?",
  localized: [
    ["en", "https://example.com/:path(.*)?"], // This will match ANY path
    ["en", "https://example.com/en/blog/:id"], // This specific pattern will never be reached
  ],
}

// CORRECT ORDER: Specific patterns first, then more general patterns
{
  pattern: "https://example.com/:path(.*)?",
  localized: [
    ["en", "https://example.com/en/blog/:id"], // Specific pattern first
    ["en", "https://example.com/:path(.*)?"], // General pattern last
  ],
}

// INCORRECT ORDER FOR DELOCALIZATION: Generic pattern first will cause problems
{
  pattern: "/:path(.*)?",
  localized: [
    ["en", "/:path(.*)?"],      // Generic pattern will match everything including "/de/about"
    ["de", "/de/:path(.*)?"],   // Pattern with prefix won't be reached for delocalization
  ],
}

// CORRECT ORDER: More specific patterns with prefixes should come first
{
  pattern: "/:path(.*)?",
  localized: [
    ["de", "/de/:path(.*)?"],   // Specific pattern with prefix first
    ["en", "/:path(.*)?"],      // Generic pattern last
  ],
}
```

### Trailing slashes

URLPattern treats `/about` and `/about/` as different paths. To handle both consistently, your framework or server should normalize trailing slashes before the middleware runs. Most frameworks (Next.js, SvelteKit, Astro) handle this automatically.

If you're seeing redirect loops involving trailing slashes, check your framework's trailing slash configuration.
