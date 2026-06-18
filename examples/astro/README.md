---
title: Astro i18n - Lightweight Internationalization for Content Sites
description: Add multi-language support to your Astro site with Paraglide JS. Type-safe translations, localized routing, and up to 70% smaller i18n bundle sizes than traditional i18n libraries.
image: https://cdn.jsdelivr.net/gh/opral/paraglide-js@latest/examples/astro/assets/banner.png
---

<img src="https://cdn.jsdelivr.net/gh/opral/paraglide-js@latest/examples/astro/assets/banner.png" alt="i18n library for astro" width="10000000px" />

Paraglide JS is the ideal i18n library for Astro's content-focused sites.

It's a compiler-based i18n library that emits tree-shakable translations, leading to up to 70% smaller i18n bundle sizes compared to runtime based libraries.

- Fully type-safe with IDE autocomplete
- SEO-friendly localized URLs with the [i18n routing strategy](https://paraglidejs.com/strategy#url)
- Works with CSR and SSR

[Source code](https://github.com/opral/paraglide-js/tree/main/examples/astro)

> [!NOTE]
> This example uses Astro's server output and Paraglide's server middleware.
> If you use Astro SSG with `getStaticPaths()`, use `output: "static"` and set
> the locale during prerendering instead of using `paraglideMiddleware()`. See
> [Static Site Generation](/static-site-generation#astro-getstaticpaths).

## Setup

### 1. If you have not initialized Paraglide JS yet, run:

```bash
npx @inlang/paraglide-js@latest init
```

### 2. Add the vite plugin to the `astro.config.mjs` file and set `output` to `server`:

```diff
import { defineConfig } from "astro/config";
+import { paraglideVitePlugin } from "@inlang/paraglide-js";
+import node from "@astrojs/node";

export default defineConfig({
  // ... other
+	vite: {
+		plugins: [
+			paraglideVitePlugin({
+				project: "./project.inlang",
+				outdir: "./src/paraglide",
+			}),
+		],
	},
+  output: "server",
+  adapter: node({ mode: "standalone" }),
});
```

### 3. Create or add the paraglide js server middleware to the `src/middleware.ts` file:

```diff
import { paraglideMiddleware } from "./paraglide/server.js";

export const onRequest = defineMiddleware((context, next) => {
+	return paraglideMiddleware(context.request, ({ request }) => next(request));
});
```

You can read more about about Astro's middleware [here](https://docs.astro.build/en/guides/middleware).

> [!IMPORTANT]
> `output: "server"` makes Astro treat dynamic routes as server-rendered. Astro
> will ignore `getStaticPaths()` for those routes unless the route opts into
> prerendering. For fully static localized pages, follow the Astro SSG setup
> instead of the server middleware setup above.

## Usage

```js
import { m } from "./paraglide/messages.js";
import { getLocale, getTextDirection, setLocale } from "./paraglide/runtime.js";

// Use messages
m.greeting({ name: "World" }); // "Hello World!"

// Get and set locale
getLocale();    // "en"
getTextDirection(); // "ltr" | "rtl" for current locale
setLocale("de"); // switches to German
```

[Learn more about messages, parameters, and locale management →](/basics)

## Disabling AsyncLocalStorage

If you're deploying Astro to Vercel Edge or to Cloudflare Workers with Node.js compatibility enabled, keep AsyncLocalStorage enabled. Those runtimes support it today, so `disableAsyncLocalStorage` is no longer part of the recommended setup.

`disableAsyncLocalStorage` remains available as a compatibility fallback for runtimes that do not provide `AsyncLocalStorage` or `node:async_hooks` but still isolate each request.

> [!WARNING]
> Only use this fallback when your runtime guarantees per-request isolation. Using it in a multi-request server environment could leak locale state between concurrent requests.

See [AsyncLocalStorage in the Middleware Guide](/middleware#asynclocalstorage) if you need that escape hatch.
