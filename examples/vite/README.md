---
title: Vite i18n - Internationalization for Any Vite Project
description: Add multi-language support to any Vite project with Paraglide JS. Works with React, Vue, Svelte, Solid, and more. Type-safe translations with up to 70% smaller i18n bundle sizes.
og:image: https://raw.githubusercontent.com/opral/paraglide-js/main/examples/vite/banner.svg
---

![Paraglide + Vite banner](https://raw.githubusercontent.com/opral/paraglide-js/main/examples/vite/banner.svg)

Paraglide JS is a build-time i18n library for Vite.

Setup is just one plugin and Vite's tree-shaking eliminates unused messages automatically—leading to up to 70% smaller i18n bundles compared to runtime libraries.

- **One plugin setup** — no complex configuration, just add `paraglideVitePlugin` and you're done
- **Works with any framework** — React, Vue, Svelte, Solid, Preact, Lit, or vanilla JS
- **Fully type-safe** — IDE autocomplete for message keys and parameters
- **i18n routing** — SEO-friendly localized URLs with the [strategy system](https://inlang.com/m/gerre34r/library-inlang-paraglideJs/strategy#url)

## Why Vite + Paraglide?

Vite tree-shakes unused code. Paraglide compiles each message into a separate function. Combined, you get [up to 70% smaller i18n bundle sizes](https://inlang.com/m/gerre34r/library-inlang-paraglideJs/benchmark) than runtime i18n libraries:

```json
// messages/en.json
{ "greeting": "Hello {name}!", "unused": "I'm never used" }
```

```js
// your app
m.greeting({ name: "World" });
// m.unused();  <-- commented out, not used
```

```diff
// bundle output
function greeting(params) { return `Hello ${params.name}!`; }
- function unused() { return "I'm never used"; }
```

Unused messages are automatically removed from the bundle. [See the benchmark](https://inlang.com/m/gerre34r/library-inlang-paraglideJs/benchmark).

### Framework specific Vite guides

<p>
  <a href="https://inlang.com/m/gerre34r/library-inlang-paraglideJs/sveltekit"><img src="https://cdn.simpleicons.org/svelte/FF3E00" alt="Svelte" width="18" height="18" /> SvelteKit</a> ·
  <a href="https://inlang.com/m/gerre34r/library-inlang-paraglideJs/astro"><img src="https://cdn.simpleicons.org/astro/FF5D01" alt="Astro" width="18" height="18" /> Astro</a> ·
  <a href="https://github.com/TanStack/router/tree/main/examples/react/start-i18n-paraglide"><img src="https://tanstack.com/images/logos/logo-color-100.png" alt="TanStack" width="18" height="18" /> TanStack Start</a>
</p>

## Getting started

```bash
npx @inlang/paraglide-js@latest init
```

Add the vite plugin to your `vite.config.ts`:

```diff
import { defineConfig } from "vite";
+import { paraglideVitePlugin } from "@inlang/paraglide-js";

export default defineConfig({
  plugins: [
+    paraglideVitePlugin({
+      project: "./project.inlang",
+      outdir: "./src/paraglide",
+    }),
  ],
});
```

## Usage

```js
import { m } from "./paraglide/messages.js";
import { getLocale, setLocale } from "./paraglide/runtime.js";

// Use messages
m.greeting({ name: "World" }); // "Hello World!"

// Get and set locale
getLocale(); // "en"
setLocale("de"); // switches to German
```

[Learn more about messages, parameters, and locale management →](https://inlang.com/m/gerre34r/library-inlang-paraglideJs/basics)

## Advanced concepts

- [I18n routing](https://inlang.com/m/gerre34r/library-inlang-paraglideJs/i18n-routing) — localized URLs and translated pathnames
- [Server-side rendering](https://inlang.com/m/gerre34r/library-inlang-paraglideJs/server-side-rendering) — SSR with request isolation
- [Variants](https://inlang.com/m/gerre34r/library-inlang-paraglideJs/variants) — pluralization, gender, and conditional messages
