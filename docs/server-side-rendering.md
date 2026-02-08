---
title: Server-Side Rendering
description: Server-side rendering with Paraglide JS - AsyncLocalStorage, streaming SSR, hydration, and framework integration.
imports:
  - https://cdn.jsdelivr.net/npm/@opral/markdown-wc-doc-elements/dist/doc-video.js
---

# Server-Side Rendering (SSR)

Paraglide JS provides first-class SSR support through the `paraglideMiddleware()`. The middleware handles locale detection, URL delocalization, and request isolation automatically.

> [!TIP]
> For middleware setup, framework examples, and troubleshooting, see the [Middleware Guide](./middleware).

## Basic Setup

```ts
import { paraglideMiddleware } from './paraglide/server.js';

app.get("*", async (request) => {
  return paraglideMiddleware(request, async ({ request, locale }) => {
    return new Response(html(request));
  });
});
```

<doc-video src="https://youtu.be/RO_pMjSHgpI"></doc-video>

*Video: How Paraglide's SSR middleware works with locale detection and request isolation.*

## How Locale Context Works

The middleware uses [AsyncLocalStorage](https://nodejs.org/api/async_context.html#class-asynclocalstorage) (a way to pass context through async calls without explicit parameters) to maintain locale state across async operations. This means `getLocale()` returns the correct locale even in deeply nested async code:

```ts
// Works correctly - locale is preserved through async boundaries
async function fetchUserData() {
  const locale = getLocale(); // Returns request-specific locale
  return fetch(`/api/users?lang=${locale}`);
}
```

Each concurrent request has its own isolated locale context, preventing race conditions where one request's locale could leak into another.

## Hydration

Client-side hydration works automatically. The middleware sets the locale on the server, and the client runtime reads it from the URL or a cookie on hydration.

> [!NOTE]
> Server and client must agree on the locale source. If the server reads locale from the URL but the client reads from localStorage, hydration mismatches can occur. Ensure your [strategy configuration](./strategy) is consistent across both environments.

## Streaming SSR (React 18, Solid)

Streaming SSR frameworks work with Paraglide because AsyncLocalStorage preserves context across stream chunks. The locale set at the start of the request remains available throughout the entire streaming response.

```ts
// React 18 streaming example
app.get("*", async (request) => {
  return paraglideMiddleware(request, async ({ request, locale }) => {
    const stream = await renderToReadableStream(<App />);
    return new Response(stream, {
      headers: { "Content-Type": "text/html" },
    });
  });
});
```

> [!NOTE]
> For edge runtimes (Cloudflare Workers, Vercel Edge), AsyncLocalStorage is polyfilled automatically. See [AsyncLocalStorage](./middleware#asynclocalstorage) in the Middleware Guide.

## Fallback Behavior

If no strategy resolves a locale (e.g., URL pattern doesn't match, no cookie set), the middleware falls back to your `baseLocale`. To ensure a locale is always resolved, add `baseLocale` as the last strategy:

```js
strategy: ["url", "cookie", "baseLocale"]
```

## Troubleshooting

**Wrong locale on first request**: The client may briefly show the wrong locale before hydration completes. This is normal - the server renders with the detected locale, then the client hydrates. If it persists, check that server and client use the same strategy order.

**Locale not persisting across pages**: If using cookie-based persistence, ensure the cookie is being set. Check the `Set-Cookie` header in your response and verify the cookie domain/path settings.

**Hydration mismatch errors**: Server and client disagree on the locale. Common causes:
- Different strategy order on server vs client
- Server reads URL, client reads localStorage
- Cached HTML served with stale locale

See the [Middleware Guide](./middleware#troubleshooting) for more debugging tips.

## See Also

- [Middleware Guide](./middleware) - Framework examples, troubleshooting, AsyncLocalStorage
- [Static Site Generation](./static-site-generation) - Build-time generation of localized pages
- [Strategy Configuration](./strategy) - Configure locale detection strategies
- [i18n Routing](./i18n-routing) - URL patterns, translated pathnames, domain-based routing
