---
title: Middleware
description: How Paraglide's server middleware works, its lifecycle, and how to integrate it with any framework.
---

# Middleware

This guide explains how Paraglide's server middleware works, its lifecycle, and how to integrate it with any framework.

> [!NOTE]
> The middleware is only needed for server-side rendering (SSR). If you're building a client-only SPA, skip this guide and use the runtime directly.

## Quick Reference

```ts
import { paraglideMiddleware } from './paraglide/server.js'

paraglideMiddleware(
  request: Request,
  resolve: (args: { request: Request, locale: Locale }) => Promise<Response>,
  callbacks?: { onRedirect?: (response: Response) => void }
): Promise<Response>
```

## How It Works

```
Request → paraglideMiddleware() → Response
```

That's it. The middleware only handles locale detection, URL delocalization, and request isolation. It doesn't define routes, handle navigation, or intercept links - your framework's router stays in control.

### Detailed Flow

```
  Incoming Request
        │
        ▼
┌───────────────────┐
│ 1. LOCALE         │  Evaluate strategies in order:
│    DETECTION      │  url → cookie → preferredLanguage → baseLocale
│                   │  First strategy that returns a locale wins.
└───────────────────┘
        │
        ▼
┌───────────────────┐
│ 2. REDIRECT       │  If URL strategy is used AND URL doesn't match
│    CHECK          │  the detected locale → redirect (307) to correct URL.
│                   │  Only redirects "document" requests (not API/assets).
└───────────────────┘
        │
        ▼
┌───────────────────┐
│ 3. URL            │  If URL strategy is used:
│    DELOCALIZATION │  /de/about → /about (strips locale prefix)
│                   │  Your app receives the "clean" URL.
└───────────────────┘
        │
        ▼
┌───────────────────┐
│ 4. ASYNC LOCAL    │  Wraps request in AsyncLocalStorage context.
│    STORAGE        │  getLocale() returns correct locale for THIS request.
│                   │  Prevents locale bleeding between concurrent requests.
└───────────────────┘
        │
        ▼
┌───────────────────┐
│ 5. YOUR HANDLER   │  Your resolve() callback runs here.
│    (resolve)      │  Call getLocale(), use messages, render your app.
└───────────────────┘
        │
        ▼
    Response
```

## Parameters

### `request: Request`

The incoming [Web API Request](https://developer.mozilla.org/en-US/docs/Web/API/Request) object.

### `resolve: (args) => Promise<Response>`

Your request handler. Receives:

- **`request`**: A potentially modified request with delocalized URL (e.g., `/de/about` → `/about`). Use this unless your framework handles URL localization itself.
- **`locale`**: The detected locale for this request.

### `callbacks` (optional)

- **`onRedirect(response)`**: Called when middleware issues a redirect. Useful for logging or analytics.

## Framework Examples

### SvelteKit

```ts
// src/hooks.server.ts
import { paraglideMiddleware } from "./paraglide/server.js";
import type { Handle } from "@sveltejs/kit";

export const handle: Handle = ({ event, resolve }) => {
	return paraglideMiddleware(event.request, ({ request, locale }) => {
		return resolve({ ...event, request });
	});
};
```

### Next.js (App Router)

```ts
// middleware.ts
import { paraglideMiddleware } from "./paraglide/server.js";
import { NextResponse } from "next/server";

export async function middleware(request: Request) {
	return paraglideMiddleware(request, async ({ request, locale }) => {
		return NextResponse.next();
	});
}
```

### Astro

```ts
// src/middleware.ts
import { paraglideMiddleware } from "./paraglide/server.js";
import { defineMiddleware } from "astro:middleware";

export const onRequest = defineMiddleware((context, next) => {
	return paraglideMiddleware(context.request, ({ request }) => next(request));
});
```

### TanStack Start

> [!WARNING]
> TanStack Router handles URL rewriting itself via `rewrite.input`/`rewrite.output`. Pass the **original request** to avoid redirect loops.

```ts
// server.ts
import { paraglideMiddleware } from "./paraglide/server.js";
import handler from "@tanstack/react-start/server-entry";

export default {
	fetch(req: Request): Promise<Response> {
		// Pass original `req` - NOT the modified `request` from callback
		return paraglideMiddleware(req, () => handler.fetch(req));
	},
};
```

### Hono

```ts
import { Hono } from "hono";
import { paraglideMiddleware } from "./paraglide/server.js";

const app = new Hono();

app.use("*", async (c) => {
	return paraglideMiddleware(c.req.raw, async ({ request, locale }) => {
		// Your route handling here
		return c.text(`Locale: ${locale}`);
	});
});

export default app;
```

### Cloudflare Workers

```ts
import { paraglideMiddleware } from "./paraglide/server.js";

export default {
	async fetch(request: Request): Promise<Response> {
		return paraglideMiddleware(request, async ({ request, locale }) => {
			return new Response(`Hello from ${locale}!`);
		});
	},
};
```

> [!TIP]
> Cloudflare Workers isolate each request automatically, so AsyncLocalStorage works correctly even though it uses a mock implementation internally.

## Excluding Routes from Middleware

To skip i18n for specific routes (for example API endpoints), use `routeStrategies` with `exclude: true` in your compiler config.

This is especially useful when public pages are URL-prefixed, but private routes like `/dashboard` are intentionally unprefixed and should use cookie-based locale detection.

```ts
compile({
	project: "./project.inlang",
	outdir: "./src/paraglide",
	strategy: ["url", "cookie", "baseLocale"],
	routeStrategies: [
		{ match: "/dashboard/:path(.*)?", strategy: ["cookie", "baseLocale"] },
		{ match: "/rpc/:path(.*)?", strategy: ["cookie", "baseLocale"] },
		{ match: "/api/:path(.*)?", exclude: true },
	],
});
```

`routeStrategies` are matched in declaration order. The first match wins.

For excluded routes, Paraglide skips i18n middleware behavior (locale redirects and URL de-localization).

## When to Use `request` vs Original Request

| Scenario                                                  | Use                     |
| --------------------------------------------------------- | ----------------------- |
| Framework does NOT handle URL rewriting                   | `request` from callback |
| Framework handles URL rewriting (TanStack Router, custom) | Original `req`          |
| You're not using URL strategy at all                      | Either works            |

**Rule of thumb:** If you see redirect loops, try passing the original request instead of the callback's `request`.

## Redirect Behavior

The middleware only redirects when ALL of these are true:

1. URL strategy is configured
2. The request is for a document (not API, assets, etc.)
3. The URL locale doesn't match the detected locale

Redirects use HTTP 307 (Temporary Redirect) to preserve the request method.

### Controlling Redirects

To prevent redirects and let the URL always determine the locale:

```ts
// Put URL first in strategy - URL always wins
strategy: ["url", "cookie", "baseLocale"];
```

To allow cookie/preference to override URL (causes redirects):

```ts
// Cookie takes precedence - may redirect to match cookie locale
strategy: ["cookie", "url", "baseLocale"];
```

## AsyncLocalStorage

The middleware uses [AsyncLocalStorage](https://nodejs.org/api/async_context.html#class-asynclocalstorage) to isolate locale state between concurrent requests.

### Why It Matters

Without request isolation, concurrent requests could interfere:

```
Request A (locale: de) ─────────────────────────────────────►
                          Request B (locale: en) ──────────►
                          │
                          └─ Without isolation, Request A might
                             suddenly see locale "en" here!
```

### Disabling AsyncLocalStorage

> [!WARNING]
> Only disable AsyncLocalStorage in environments that guarantee request isolation (Cloudflare Workers, Vercel Edge, AWS Lambda single-request mode).

```ts
paraglideVitePlugin({
	project: "./project.inlang",
	outdir: "./src/paraglide",
	disableAsyncLocalStorage: true, // Use with caution
});
```

## Troubleshooting

### `getLocale()` returns wrong locale

#### Cause

Calling `getLocale()` outside the middleware context.

#### Solution

Ensure `getLocale()` is called inside the middleware callback:

```ts
// ❌ Wrong - outside middleware
const locale = getLocale(); // Returns server's default locale

app.use((req) => {
	return paraglideMiddleware(req, ({ locale }) => {
		// ✅ Correct - inside middleware
		const locale = getLocale(); // Returns request's locale
	});
});
```

### Redirect loops

#### Cause

Both the middleware AND your framework are handling URL localization/delocalization.

#### Solution

Pass the original request to your framework instead of the modified one:

```ts
// ❌ Causes loop
paraglideMiddleware(req, ({ request }) => handler(request));

// ✅ Fixes loop
paraglideMiddleware(req, () => handler(req));
```

The middleware still handles locale detection, cookies, and AsyncLocalStorage context - only the URL delocalization is bypassed.

#### Why this happens

Some frameworks like TanStack Router handle URL localization themselves via rewrite APIs (e.g., `rewrite.input`/`rewrite.output`). The `paraglideMiddleware()` also de-localizes URLs when the URL strategy is used (e.g., `/en/about` → `/about`). If both do it, you get a conflict:

```
1. Request: /en/about
2. Middleware delocalizes → /about
3. Framework localizes → /en/about
4. Middleware delocalizes → /about
5. ... (infinite loop)
```

#### Frameworks that handle URL localization

- **TanStack Router/Start** - Uses `deLocalizeUrl`/`localizeUrl` in rewrite options
- Other frameworks with built-in i18n URL rewriting

### Locale bleeds between requests

#### Cause

AsyncLocalStorage disabled in a multi-request environment.

#### Solution

Ensure AsyncLocalStorage is enabled (the default):

```ts
paraglideVitePlugin({
	project: "./project.inlang",
	outdir: "./src/paraglide",
	// Don't set this to true unless you're in a serverless environment
	// disableAsyncLocalStorage: true,
});
```

If you must disable it, ensure your environment isolates requests (Cloudflare Workers, Vercel Edge, AWS Lambda).

### Cookies not being set

#### Cause

Cookie strategy is configured but the cookie isn't being sent to the browser.

#### Solution

Paraglide middleware doesn't set cookies automatically. Use `setLocale()` on the client:

```ts
import { setLocale } from "./paraglide/runtime.js";

// On the client - this updates the cookie automatically
setLocale("de");
```

Or set it manually in your server response:

```ts
return new Response(body, {
	headers: {
		"Set-Cookie": `PARAGLIDE_LOCALE=${locale}; Path=/; Max-Age=31536000`,
	},
});
```

## Custom Strategies

You can define custom locale detection strategies alongside built-in ones.

### Client-Side Custom Strategy

```ts
import { defineCustomClientStrategy } from "./paraglide/runtime.js";

defineCustomClientStrategy("custom-sessionStorage", {
	getLocale: () => sessionStorage.getItem("locale") ?? undefined,
	setLocale: (locale) => sessionStorage.setItem("locale", locale),
});
```

### Server-Side Custom Strategy

```ts
import { defineCustomServerStrategy } from "./paraglide/runtime.js";

// Sync example
defineCustomServerStrategy("custom-header", {
	getLocale: (request) => request?.headers.get("X-Locale") ?? undefined,
});

// Async example (database lookup)
defineCustomServerStrategy("custom-database", {
	getLocale: async (request) => {
		const userId = extractUserId(request);
		if (!userId) return undefined;
		return await getUserLocaleFromDB(userId);
	},
});
```

### Using Custom Strategies

```ts
paraglideVitePlugin({
	project: "./project.inlang",
	outdir: "./src/paraglide",
	strategy: ["custom-header", "url", "cookie", "baseLocale"],
});
```

Custom strategies must be named `custom-<name>` and are evaluated in order with other strategies.

## See Also

- [Standalone Servers](./standalone-servers) - Full setup for Express, Hono, Fastify, Elysia
- [Strategy Configuration](./strategy) - Configure locale detection strategies
- [i18n Routing](./i18n-routing) - URL patterns, translated pathnames, domain-based routing
- [Server-Side Rendering](./server-side-rendering) - Dynamic rendering with middleware
- [Static Site Generation](./static-site-generation) - Build-time page generation
- [Compiling Messages](./compiling-messages) - Build configuration
