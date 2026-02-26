---
title: Astro i18n - Lightweight Internationalization for Content Sites
description: Add multi-language support to your Astro site with Paraglide JS. Type-safe translations, localized routing, and up to 70% smaller i18n bundle sizes than traditional i18n libraries.
image: https://cdn.jsdelivr.net/gh/opral/paraglide-js@latest/examples/astro/assets/banner.png
---

<img src="https://cdn.jsdelivr.net/gh/opral/paraglide-js@latest/examples/astro/assets/banner.png" alt="i18n library for astro" width="10000000px" />

Paraglide JS is the ideal i18n library for Astro's content-focused sites.

It's a compiler-based i18n library that emits tree-shakable translations, leading to up to 70% smaller i18n bundle sizes compared to runtime based libraries.

- Fully type-safe with IDE autocomplete
- SEO-friendly localized URLs with the [i18n routing strategy](https://inlang.com/m/gerre34r/library-inlang-paraglideJs/strategy#url)
- Works with CSR and SSR

[Source code](https://github.com/opral/paraglide-js/tree/main/examples/astro)

> [!NOTE]
> SSG is not yet supported out of the box. You can integrate Paraglide JS yourself to achieve SSG. PR with an example is welcome.

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

[Learn more about messages, parameters, and locale management →](/m/gerre34r/library-inlang-paraglideJs/basics)

## Disabling AsyncLocalStorage in serverless environments

You can disable async local storage in serverless environments by using the `disableAsyncLocalStorage` option.

> [!WARNING]
> This is only safe in serverless environments where each request gets its own isolated runtime context. Using it in multi-request server environments could lead to data leakage between concurrent requests.


```diff
	vite: {
		plugins: [
			paraglideVitePlugin({
				project: "./project.inlang",
				outdir: "./src/paraglide",
+				disableAsyncLocalStorage: true,
			}),
		],
	},
```
