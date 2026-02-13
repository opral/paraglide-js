---
title: Locale Detection
description: Configure Paraglide JS locale detection - URL, cookies, localStorage, Accept-Language header, and custom strategies.
---

# Strategy

Paraglide JS comes with various strategies to determine the locale of a user.

> [!TIP]
> For server-side integration details and framework examples, see the [Middleware Guide](./middleware).

The strategy is defined with the `strategy` option. **Strategies are evaluated in order** - the first strategy that successfully returns a locale will be used, and subsequent strategies won't be checked. Think of the array as a simple fallback chain: each strategy is attempted until one succeeds, keeping the API predictable.

In the example below, the `cookie` strategy first determines the locale. If no cookie is found (returns `undefined`), the `baseLocale` is used as a fallback.

> [!NOTE]
> Add this to your compiler config. It will look slightly different depending on how you compile (bundler plugin, CLI, or programmatic). See [Compiling Messages](./compiling-messages) for the relevant setup.

```diff
compile({
	project: "./project.inlang",
	outdir: "./src/paraglide",
+	strategy: ["cookie", "baseLocale"]
})
```

**Strategy order matters**: because the array is a fallthrough list, earlier strategies have priority. Strategies that always resolve a locale (like `url` with wildcards or `baseLocale`) should typically be placed last as fallbacks, since they prevent subsequent strategies from being evaluated. For example, placing `preferredLanguage` before `localStorage` means the browser's language will always win and a user's manual selection in `localStorage` will never take effect.

## Common Strategy Patterns

Here are some common strategy patterns and when to use them:

### URL as source of truth (default behavior)

```js
strategy: ["url", "baseLocale"];
```

Use this when the URL should always determine the locale. The URL pattern (with wildcards) will always resolve, making `baseLocale` a safety fallback only.

### Prioritize user preferences

```js
strategy: ["localStorage", "cookie", "url", "baseLocale"];
```

Use this when you want returning visitors to see content in their previously selected language, regardless of the URL they land on. The URL only determines locale if no preference is stored.

### Automatic language detection with persistent override

```js
strategy: ["localStorage", "preferredLanguage", "url", "baseLocale"];
```

Use this when you want first-time visitors to see content in their browser's language but still allow manual language changes to persist via `localStorage`.

The fallback chain flows left to right: `localStorage → preferredLanguage → url → baseLocale`.
Because `localStorage` is first, a stored selection overrides the browser setting. If it's missing, the arrow falls through to `preferredLanguage`, then `url`, and finally `baseLocale`.

## Built-in strategies

### cookie

The cookie strategy determines the locale from a cookie.

```diff
compile({
	project: "./project.inlang",
	outdir: "./src/paraglide",
+	strategy: ["cookie"]
})
```

### baseLocale

Returns the `baseLocale` defined in the settings.

It is useful as a fallback strategy if no other strategy returns a locale, for example, if a cookie has not been set yet.

```diff
compile({
	project: "./project.inlang",
	outdir: "./src/paraglide",
+	strategy: ["cookie", "baseLocale"]
})
```

### globalVariable

Uses a global variable to determine the locale.

This strategy is only useful in testing environments or to get started quickly. Setting a global variable can lead to cross-request issues in server-side environments, and the locale is not persisted between page reloads in client-side environments.

```diff
compile({
	project: "./project.inlang",
	outdir: "./src/paraglide",
+	strategy: ["globalVariable"]
})
```

### preferredLanguage

Automatically detects the user's preferred language from browser settings or HTTP headers.

- On the client: Uses [navigator.languages](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/languages)
- On the server: Uses the [Accept-Language header](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Accept-Language)

```diff
compile({
	project: "./project.inlang",
	outdir: "./src/paraglide",
+	strategy: ["preferredLanguage", "baseLocale"]
})
```

The strategy attempts to match locale in order of user preference:

1. First try exact matches (e.g., "en-US" if supported)
2. Falls back to base language codes (e.g., "en")

For example:

- If user prefers `fr-FR,fr;q=0.9,en;q=0.7` and your app supports `["en", "fr"]`, it will use `fr`
- If user prefers `en-US` and your app only supports `["en", "de"]`, it will use `en`

### localStorage

Determine the locale from the user's local storage.

```diff
compile({
	project: "./project.inlang",
	outdir: "./src/paraglide",
+	strategy: ["localStorage"]
})
```

### url

Determine the locale from the URL (pathname, domain, etc) using the `urlPatterns` configuration.

```diff
compile({
	project: "./project.inlang",
	outdir: "./src/paraglide",
+	strategy: ["url", "cookie"],
+	// The url strategy uses these patterns (or defaults if not specified)
+	urlPatterns: [/* your patterns */]
})
```

The URL-based strategy uses the web standard [URLPattern](https://developer.mozilla.org/en-US/docs/Web/API/URL_Pattern_API) to match and localize URLs based on your `urlPatterns` configuration.

**[Read the i18n Routing Guide →](./i18n-routing)** for comprehensive coverage of locale prefixing, translated pathnames, domain-based routing, and URL pattern configuration.

> [!NOTE]
> **Default URL Patterns**: If you don't specify `urlPatterns`, Paraglide uses a default pattern with a wildcard `/:path(.*)?` that matches any path. For paths without a locale prefix, this resolves to your base locale. This is why the `url` strategy always finds a match by default.

## Route-level strategy overrides

You can override strategy behavior per route with `routeStrategies`.

Common use case:

- Public pages use URL prefixes (`/de/...`) and keep `url` in the global strategy.
- Private routes like `/dashboard` are never prefixed and should read locale from cookie.
- API/RPC routes should skip i18n middleware behavior entirely.

Without route-level overrides, `url` with wildcard patterns resolves unprefixed routes to `baseLocale` before cookie fallback.

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

Rules:

- Route rules are checked in declaration order.
- The first matching rule wins.
- `exclude: true` disables i18n middleware behavior for the matched route.

## Write your own strategy

Write your own cookie, http header, or i18n routing based locale strategy to integrate Paraglide into any framework or app.

Only two APIs are needed to define this behaviour and adapt Paraglide JS to your requirements:

- `overwriteGetLocale` defines the `getLocale()` function that messages use to determine the locale
- `overwriteSetLocale` defines the `setLocale()` function that apps call to change the locale

Because the client and server have separate Paraglide runtimes, you will need to define these behaviours separately on the client and server.

The steps are usually the same, irrespective of the strategy and framework you use:

1. Use `overwriteGetLocale()` function that reads the locale from a cookie, HTTP header, or i18n routing.
2. Handle any side effects of changing the locale and trigger a re-render in your application via `overwriteSetLocale()` (for many apps, this may only be required on the client side).

_Read the [architecture documentation](https://inlang.com/m/gerre34r/library-inlang-paraglideJs/architecture) to learn more about's Paraglide's inner workings._

### Dynamically resolving the locale (cookies, http headers, i18n routing, etc.)

To dynamically resolve the locale, pass a function that returns the locale to `getLocale()`. You can use this to get the locale from the `documentElement.lang` attribute, a cookie, a locale route, or any other source.

```js
import { m } from "./paraglide/messages.js";
import { overwriteGetLocale } from "./paraglide/runtime.js";

overwriteGetLocale(() => document.documentElement.lang /** en */);

m.orange_dog_wheel(); // Hello world!
```

On the server, you might determine the locale from a cookie, a locale route, a http header, or anything else. When calling `overwriteGetLocale()` on the server, you need to be mindful of race conditions caused when multiple requests come in at the same time with different locales.

To avoid this, use `AsyncLocaleStorage` in Node, or its equivalent for other server-side JS runtimes.

```js
import { m } from "./paraglide/messages.js";
import { overwriteGetLocale, baseLocale } from "./paraglide/runtime.js";
import { AsyncLocalStorage } from "node:async_hooks";
const localeStorage = new AsyncLocalStorage();

overwriteGetLocale(() => {
	//any calls to getLocale() in the async local storage context will return the stored locale
	return localeStorage.getStore() ?? baseLocale;
});

export function onRequest(request, next) {
	const locale = detectLocale(request); //parse the locale from headers, cookies, etc.
	// set the async locale storage for the current request
	// to the detected locale and let the request continue
	// in that context
	return localeStorage.run(locale, async () => await next());
}
```

### Custom strategies

In addition to overwriting the `getLocale()` and `setLocale()` functions, Paraglide supports defining custom strategies that can be included alongside built-in strategies in your strategy array. This approach provides a cleaner way to encapsulate custom locale resolution logic.

Custom strategies must follow the naming pattern `custom-<name>` where `<name>` can contain any characters (including hyphens, underscores, etc.).

They can be defined in both client- and server-side environments, enabling you to develop reusable locale resolution logic that integrates seamlessly with Paraglide's runtime. Use the `defineCustomClientStrategy()` and `defineCustomServerStrategy()` functions to write strategies for each environment. Follow the examples below to define your own custom strategies.

To use them, you need to include them in the `strategy` array when configuring your project.

```diff
compile({
	project: "./project.inlang",
	outdir: "./src/paraglide",
+	strategy: ["custom-userPreferences", "cookie", "baseLocale"]
})
```

#### Client-side custom strategies

Define a custom strategy for client-side locale resolution using `defineCustomClientStrategy()`. The handler must implement both `getLocale()` and `setLocale()` methods.

**When to use**: Use client-side custom strategies when you need to read/write locale from sources that are only available in the browser (like query parameters, sessionStorage, URL hash, etc.).

**Where to call**: Define your custom strategies in your app's initialization code, before the runtime starts using them. For framework apps, this is typically in your main app file, a layout component, or a plugin/middleware setup.

```js
import { defineCustomClientStrategy } from "./paraglide/runtime.js";

// Example 1: sessionStorage strategy
defineCustomClientStrategy("custom-sessionStorage", {
	getLocale: () => {
		return sessionStorage.getItem("user-locale") ?? undefined;
	},
	setLocale: (locale) => {
		sessionStorage.setItem("user-locale", locale);
	},
});

// Example 2: Query parameter strategy (answers the original question!)
defineCustomClientStrategy("custom-queryParam", {
	getLocale: () => {
		const urlParams = new URLSearchParams(window.location.search);
		return urlParams.get("locale") ?? undefined;
	},
	setLocale: (locale) => {
		const url = new URL(window.location);
		url.searchParams.set("locale", locale);
		window.history.replaceState({}, "", url.toString());
	},
});

// Example 3: URL hash strategy
defineCustomClientStrategy("custom-hash", {
	getLocale: () => {
		const hash = window.location.hash.slice(1); // Remove #
		return hash.startsWith("lang=") ? hash.replace("lang=", "") : undefined;
	},
	setLocale: (locale) => {
		window.location.hash = `lang=${locale}`;
	},
});
```

#### Server-side custom strategies

For server-side custom strategies, use `defineCustomServerStrategy()`. The handler only needs to implement a `getLocale()` method that accepts an optional `Request` parameter.

**When to use**: Use server-side custom strategies when you need to read locale from server-specific sources (like custom headers, databases, authentication systems, etc.).

**Where to call**: Define your custom strategies in your server initialization code, before the middleware starts processing requests. For framework apps, this is typically in your server setup file or middleware configuration.

**Async support**: Server-side custom strategies support async operations! If your `getLocale` method returns a Promise, the system will automatically use the async locale extraction path.

```js
import { defineCustomServerStrategy } from "./paraglide/runtime.js";

// Example 1: Custom header strategy
defineCustomServerStrategy("custom-header", {
	getLocale: (request) => {
		const locale = request?.headers.get("X-Custom-Locale");
		return locale ?? undefined;
	},
});

// Example 2: Async database strategy
defineCustomServerStrategy("custom-database", {
	getLocale: async (request) => {
		const userId = extractUserIdFromRequest(request);
		if (!userId) return undefined;

		try {
			// This async call is supported!
			return await getUserLocaleFromDatabase(userId);
		} catch (error) {
			console.warn("Failed to fetch user locale:", error);
			return undefined;
		}
	},
});

// Example 3: Query parameter on server (for SSR)
defineCustomServerStrategy("custom-serverQuery", {
	getLocale: (request) => {
		const url = new URL(request.url);
		return url.searchParams.get("locale") ?? undefined;
	},
});
```

#### Advanced example: Full-stack user preference strategy

Here's a complete example showing how to implement user preference strategies on both client and server, with async database support:

```js
// File: src/locale-strategies.js
import {
	defineCustomClientStrategy,
	defineCustomServerStrategy,
} from "./paraglide/runtime.js";
import {
	getUserLocale,
	setUserLocale,
	extractUserIdFromRequest,
} from "./services/userService.js";

// Client-side strategy - works with user preferences in browser
defineCustomClientStrategy("custom-userPreference", {
	getLocale: () => {
		// Get from memory cache, framework state store, or return undefined to fall back
		return window.__userLocale ?? undefined;
	},
	setLocale: async (locale) => {
		try {
			// Update user preference in database via API
			await setUserLocale(locale);
			window.__userLocale = locale;

			// Optional: Also update URL query param for immediate reflection
			const url = new URL(window.location);
			url.searchParams.set("locale", locale);
			window.history.replaceState({}, "", url.toString());
		} catch (error) {
			console.warn("Failed to save user locale preference:", error);
			// Strategy can still succeed even if save fails
		}
	},
});

// Server-side strategy - async database lookup
defineCustomServerStrategy("custom-userPreference", {
	getLocale: async (request) => {
		const userId = extractUserIdFromRequest(request);
		if (!userId) return undefined;

		try {
			// Async database call - this is now fully supported!
			return await getUserLocale(userId);
		} catch (error) {
			console.warn("Failed to fetch user locale from database:", error);
			return undefined; // Fallback to next strategy
		}
	},
});
```

#### Custom strategy benefits

Custom strategies offer several advantages over the traditional `overwriteGetLocale()` approach:

- **Composability**: They can be combined with built-in strategies in a single strategy array
- **Priority handling**: They respect the strategy order, allowing fallbacks to other strategies
- **Framework integration**: Easier to package and distribute with framework adapters
- **Type safety**: Better TypeScript support for custom strategy handlers
- **Error isolation**: If a custom strategy fails, execution continues with the next strategy
- **Async support**: Server-side strategies can perform async operations like database queries
- **Middleware compatibility**: Work seamlessly with Paraglide's server middleware

#### Important Notes

**Async Support**:

- ✅ Server-side strategies support async `getLocale` methods
- ❌ Client-side strategies must have synchronous `getLocale` methods (but `setLocale` can be async)
- ✅ When any custom strategy uses async `setLocale`, the main `setLocale()` function becomes async and page reloads wait for all async operations to complete
- If you need async client-side locale detection, use the `overwriteGetLocale()` approach instead

**Strategy Priority**:

- Custom strategies are processed in the order they appear in your `strategy` array
- If a custom strategy returns `undefined`, the system falls back to the next strategy
- Server-side: Custom strategies are checked first, then built-in strategies
- Client-side: All strategies (custom and built-in) are processed in your defined order

**Validation**:
Custom strategy names must start with `custom-` followed by at least one character. The name part after `custom-` can contain any characters including hyphens, underscores, etc.

Valid examples:

- `custom-sessionStorage`
- `custom-user-preference`
- `custom-query_param`
- `custom-database`

Invalid examples:

- `custom-` (no name after prefix)
- `my-custom-strategy` (doesn't start with `custom-`)
- `sessionStorage` (missing `custom-` prefix)
