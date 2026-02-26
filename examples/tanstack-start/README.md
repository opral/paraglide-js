---
title: TanStack Start i18n - Full-Stack Internationalization
description: Add multi-language support to TanStack Start apps with Paraglide JS. Type-safe translations, server-side rendering, localized routing, and up to 70% smaller i18n bundle sizes.
---

# TanStack Start example with Paraglide

Paraglide JS is the best i18n library for TanStack Start.

It's a compiler-based i18n library that emits tree-shakable translations, leading to up to 70% smaller i18n bundle sizes compared to runtime based libraries.

- Fully type-safe with IDE autocomplete
- SEO-friendly localized URLs with the [i18n routing strategy](https://inlang.com/m/gerre34r/library-inlang-paraglideJs/strategy#url)
- Works with CSR and SSR

[Source code](https://github.com/opral/paraglide-js/tree/main/examples/tanstack-start) | [TanStack Router Docs](https://tanstack.com/router)

## Start a new project based on this example

To start a new project based on this example, run:

```sh
npx gitpick TanStack/router/tree/main/examples/react/start-i18n-paraglide start-i18n-paraglide
```

## Getting started

1. Init Paraglide JS

```bash
npx @inlang/paraglide-js@latest init
```

2. Add the Vite plugin to your `vite.config.ts`:

```diff
import { defineConfig } from 'vite'
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from '@vitejs/plugin-react'
+import { paraglideVitePlugin } from "@inlang/paraglide-js";

export default defineConfig({
       plugins: [
    tanstackStart(),
    react(),
+              paraglideVitePlugin({
+                      project: "./project.inlang",
+                      outdir: "./app/paraglide",
+     outputStructure: "message-modules",
+     cookieName: "PARAGLIDE_LOCALE",
+     strategy: ["url", "cookie", "preferredLanguage", "baseLocale"],
+      urlPatterns: [
+       {
+         pattern: "/:path(.*)?",
+         localized: [
+           ["en", "/en/:path(.*)?"],
+         ],
+       },
+     ],
+              }),
       ],
});
```

3. Done :)

## Usage

```js
import { m } from "./paraglide/messages.js";
import { getLocale, setLocale } from "./paraglide/runtime.js";

// Use messages
m.greeting({ name: "World" }); // "Hello World!"

// Get and set locale
getLocale();    // "en"
setLocale("de"); // switches to German
```

[Learn more about messages, parameters, and locale management →](https://inlang.com/m/gerre34r/library-inlang-paraglideJs/basics)

## Rewrite URL

If you want to handle how the URL looks when the user changes the locale, you can rewrite the URL in the router.

```diff
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
+import { deLocalizeUrl, localizeUrl } from "./paraglide/runtime.js";

const router = createRouter({
  routeTree,
+ rewrite: {
+   input: ({ url }) => deLocalizeUrl(url),
+   output: ({ url }) => localizeUrl(url),
  },
});
```

In `server.ts` intercept the request with the paraglideMiddleware.

> **Important:** Since TanStack Router handles URL localization/delocalization via its `rewrite` option, you must pass the original `req` to the handler instead of the modified `request` from the callback. Using the modified request would cause a redirect loop because both the middleware and the router would attempt to delocalize the URL. The middleware still handles locale detection, cookies, and AsyncLocalStorage context.

```ts
import { paraglideMiddleware } from './paraglide/server.js'
import handler from '@tanstack/react-start/server-entry'
export default {
  fetch(req: Request): Promise<Response> {
    // Pass original `req` - NOT the modified `request` from the callback
    // TanStack Router handles URL rewriting via deLocalizeUrl/localizeUrl
    return paraglideMiddleware(req, () => handler.fetch(req))
  },
}
```

In `__root.tsx` change the HTML lang attribute to the current locale.

```tsx
import { getLocale, getTextDirection } from '../paraglide/runtime.js'

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang={getLocale()} dir={getTextDirection()}>
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  )
}
```

## Offline redirect

If you have an application that needs to work offline, you will need to handle the redirect in the client like this.

```ts
import { shouldRedirect } from "../paraglide/runtime";

export const Route = createRootRoute({
  beforeLoad: async () => {
    const decision = await shouldRedirect({ url: window.location.href });

    if (decision.redirectUrl) {
      throw redirect({ href: decision.redirectUrl.href });
    }
  },
  ...
});
```

## Type-safe translated pathnames

If you don't want to miss any translated path, you can create a `createTranslatedPathnames` function and pass it to the vite plugin.

```ts
import { Locale } from '@/paraglide/runtime'
import { FileRoutesByTo } from '../routeTree.gen'

type RoutePath = keyof FileRoutesByTo

const excludedPaths = ['admin', 'docs', 'api'] as const

type PublicRoutePath = Exclude<
  RoutePath,
  `${string}${(typeof excludedPaths)[number]}${string}`
>

type TranslatedPathname = {
  pattern: string
  localized: Array<[Locale, string]>
}

function toUrlPattern(path: string) {
  return (
    path
      // catch-all
      .replace(/\/\$$/, '/:path(.*)?')
      // optional parameters: {-$param}
      .replace(/\{-\$([a-zA-Z0-9_]+)\}/g, ':$1?')
      // named parameters: $param
      .replace(/\$([a-zA-Z0-9_]+)/g, ':$1')
      // remove trailing slash
      .replace(/\/+$/, '')
  )
}

function createTranslatedPathnames(
  input: Record<PublicRoutePath, Record<Locale, string>>,
): TranslatedPathname[] {
  return Object.entries(input).map(([pattern, locales]) => ({
    pattern: toUrlPattern(pattern),
    localized: Object.entries(locales).map(
      ([locale, path]) =>
        [locale as Locale, `/${locale}${toUrlPattern(path)}`] satisfies [
          Locale,
          string,
        ],
    ),
  }))
}

export const translatedPathnames = createTranslatedPathnames({
  '/': {
    en: '/',
    de: '/',
  },
  '/about': {
    en: '/about',
    de: '/ueber',
  },
})
```

And import into the Paraglide Vite plugin.

## Prerender routes

You can use the `localizeHref` function to map the routes to localized versions and import into the pages option in the TanStack Start plugin. For this to work you will need to compile paraglide before the build with the CLI.

```ts
import { localizeHref } from './paraglide/runtime'
export const prerenderRoutes = ['/', '/about'].map((path) => ({
  path: localizeHref(path),
  prerender: {
    enabled: true,
  },
}))
```

## About This Example

This example demonstrates:

- Multi-language support with Paraglide in TanStack Start
- Server-side translation
- Type-safe translations
- Locale-based routing
