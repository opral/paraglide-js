## paraglideMiddleware()

> **paraglideMiddleware**\<`T`\>(`request`, `resolve`, `options?`): `Promise`\<`Response`\>

Defined in: [server/middleware.js:94](https://github.com/opral/paraglide-js/tree/main/src/compiler/server/middleware.js)

Server middleware that handles locale-based routing and request processing.

Configure `disableAsyncLocalStorage` when generating Paraglide with
`paraglideVitePlugin()` or `compile()`, not when calling
`paraglideMiddleware()`. Keep AsyncLocalStorage enabled by default and
only disable it for runtimes that lack `AsyncLocalStorage` support and
guarantee request isolation.

This middleware performs several key functions:

1. Determines the locale for the incoming request using configured strategies
2. Handles URL localization and redirects (only for document requests)
3. Maintains locale state using AsyncLocalStorage to prevent request interference

When URL strategy is used:

- The locale is extracted from the URL for all request types
- If URL doesn't match the determined locale, redirects to localized URL (only for document requests)
- De-localizes URLs before passing to server (e.g., `/fr/about` → `/about`)

### Type Parameters

#### T

`T`

The return type of the resolve function

### Parameters

#### request

`Request`

The incoming request object

#### resolve

(`args`) => `T` \| `Promise`\<`T`\>

Function to handle the request. The callback receives:
  - `request`: A modified request with a delocalized URL when the URL strategy is used (e.g., `/fr/about` → `/about`).
     If your framework handles URL localization itself (e.g., TanStack Router's `rewrite` option), use the original
     request instead to avoid redirect loops.
  - `locale`: The determined locale for this request.

#### options?

Options to control middleware behavior. `effectiveRequestUrl` sets the effective request URL used for route matching, URL-based locale detection, redirects, and `getUrlOrigin()`.

##### effectiveRequestUrl?

`string` \| `URL` \| (`request`) => `string` \| `URL`

##### onRedirect?

(`response`) => `void`

### Returns

`Promise`\<`Response`\>

### See

https://inlang.com/m/gerre34r/library-inlang-paraglideJs/middleware

### Examples

```typescript
// Basic usage in metaframeworks like NextJS, SvelteKit, Astro, Nuxt, etc.
export const handle = async ({ event, resolve }) => {
  return paraglideMiddleware(event.request, ({ request, locale }) => {
    // let the framework further resolve the request
    return resolve(request);
  });
};
```

```typescript
// Usage in a framework like Express JS or Hono
app.use(async (req, res, next) => {
  const result = await paraglideMiddleware(req, ({ request, locale }) => {
    // If a redirect happens this won't be called
    return next(request);
  });
});
```

```typescript
// Usage with frameworks that handle URL localization/delocalization themselves
//
// Some frameworks like TanStack Router handle URL localization and delocalization
// themselves via their own rewrite APIs (e.g., `rewrite.input`/`rewrite.output`).
//
// When the framework handles this, the middleware's URL delocalization is not needed.
// Using the modified `request` from the callback would cause a redirect loop because
// both the middleware and the framework would attempt to delocalize the URL.
//
// Solution: Pass the original request to the handler instead of the modified one.
// The middleware still handles locale detection, cookies, and AsyncLocalStorage context.
//
// ❌ WRONG - causes redirect loop when framework handles URL rewriting:
// paraglideMiddleware(req, ({ request }) => handler.fetch(request))
//
// ✅ CORRECT - use original request when framework handles URL localization:
// paraglideMiddleware(req, () => handler.fetch(req))

import { paraglideMiddleware } from './paraglide/server.js'
import handler from '@tanstack/react-start/server-entry'

export default {
  fetch(req: Request): Promise<Response> {
    // TanStack Router handles URL rewriting via deLocalizeUrl/localizeUrl
    // so we pass the original `req` instead of the modified `request`
    return paraglideMiddleware(req, () => handler.fetch(req))
  },
}
```
