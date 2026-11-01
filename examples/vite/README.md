---
title: Vite i18n - Internationalization for Any Vite Project
description: Add multi-language support to any Vite project with Paraglide JS. Works with React, Vue, Svelte, Solid, and more. Type-safe translations with up to 70% smaller i18n bundle sizes.
og:title: Paraglide JS for Vite
og:image: https://raw.githubusercontent.com/opral/paraglide-js/main/examples/vite/banner.svg
---

# Vite i18n with Paraglide JS

![Paraglide + Vite banner](https://raw.githubusercontent.com/opral/paraglide-js/main/examples/vite/banner.svg)

Paraglide JS is a build-time internationalization library for Vite. It compiles translation files into typed JavaScript message functions. Vite can remove unused messages through tree-shaking, and the same generated API works with React, Vue, Svelte, Solid, or vanilla JavaScript.

**Using React? Follow the complete [React + Vite guide](https://paraglidejs.com/react)** for JSON files, a language picker, TypeScript, and document language. This page covers the framework-independent Vite integration. For SSR, use your framework's integration below.

- **One plugin setup** — no complex configuration, just add `paraglideVitePlugin` and you're done
- **Works with any framework** — React, Vue, Svelte, Solid, Preact, Lit, or vanilla JS
- **Fully type-safe** — IDE autocomplete for message keys and parameters
- **i18n routing** — SEO-friendly localized URLs with the [strategy system](https://paraglidejs.com/strategy#url)

## Why Vite + Paraglide?

Vite tree-shakes unused code. Paraglide compiles each message into a separate function. Combined, you get [up to 70% smaller i18n bundle sizes](https://paraglidejs.com/benchmark) than runtime i18n libraries:

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

Unused messages are automatically removed from the bundle. [See the benchmark](https://paraglidejs.com/benchmark).

### Framework specific Vite guides

<p>
  <a href="https://paraglidejs.com/react">React + Vite</a> ·
  <a href="https://paraglidejs.com/sveltekit"><img src="https://cdn.simpleicons.org/svelte/FF3E00" alt="Svelte" width="18" height="18" /> SvelteKit</a> ·
  <a href="https://paraglidejs.com/astro"><img src="https://cdn.simpleicons.org/astro/FF5D01" alt="Astro" width="18" height="18" /> Astro</a> ·
  <a href="https://paraglidejs.com/tanstack-start"><img src="https://tanstack.com/images/logos/logo-color-100.png" alt="TanStack" width="18" height="18" /> TanStack Start</a>
</p>

## Getting started

```bash
npx @inlang/paraglide-js@latest init
npm install
```

Run init from your application's root. It creates the locale and format configuration, adds the Vite plugin when detected, and adds the dependency to your package manifest. It does not install dependencies itself. If it reports an initial compilation failure because dependencies are missing, install them and start Vite to compile again.

Check the generated files rather than adding a second plugin. For a manual integration, install `@inlang/paraglide-js` as a dev dependency and add the plugin to your existing `vite.config.ts`. Keep any framework plugins already present. This configuration separates the project path from the compiler options in `project.inlang/paraglide.config.js`:

```diff
import { defineConfig } from "vite";
+import { paraglideVitePlugin } from "@inlang/paraglide-js";

export default defineConfig({
  plugins: [
+    paraglideVitePlugin({ project: "./project.inlang" }),
  ],
});
```

```js
// project.inlang/paraglide.config.js
export default {
  outdir: "./src/paraglide",
  emitTsDeclarations: true,
  strategy: ["cookie", "baseLocale"],
};
```

Your `project.inlang/settings.json` selects the base locale, supported locales, translation format plugin, and file paths. Init configures these interactively. For complete JSON examples, see [the React + Vite setup](https://paraglidejs.com/react#3-add-your-locales-and-translation-files); the same files work without React.

`emitTsDeclarations` requires TypeScript 5.6 or newer. JavaScript apps can use `false` and the generated JSDoc types. Add the generated output directory to `.gitignore`.

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

By default, `setLocale()` persists the selection and navigates the document. The cookie strategy above reloads the current URL; with a URL strategy, it navigates to the localized URL. It does not depend on framework reactivity. Do not use `reload: false` as an ordinary language picker; see [the constraints in Basics](https://paraglidejs.com/basics#advanced-stay-on-the-current-document).

In a client-rendered app, set `document.documentElement.lang` and `document.documentElement.dir` from `getLocale()` and `getTextDirection()` before mounting your UI. For SSR or SSG, set them in the server-rendered HTML instead and use the framework integration's request-scoped locale handling.

[Learn more about messages, parameters, and locale management →](https://paraglidejs.com/basics)

## Development and production

Run your app's `dev` and `build` scripts as usual. The Vite plugin generates message functions during development and builds and watches translation files. Start Vite before expecting generated imports to exist after a fresh checkout. Run your TypeScript check separately: a successful Vite build alone does not validate message parameter types.

Tree-shaking depends on static references such as `m.greeting()`. Unrestricted dynamic access such as `m[key]()` can retain the whole catalog. Removing unused messages is different from loading only the current locale; default output includes all configured locales for retained messages. See [dynamic messages](https://paraglidejs.com/basics#dynamic-messages), [compiler options](https://paraglidejs.com/compiling-messages), and the [benchmark methodology](https://paraglidejs.com/benchmark) before comparing bundle sizes.

## Advanced concepts

- [I18n routing](https://paraglidejs.com/i18n-routing) — localized URLs and translated pathnames
- [Server-side rendering](https://paraglidejs.com/server-side-rendering) — SSR with request isolation
- [Variants](https://paraglidejs.com/variants) — pluralization, gender, and conditional messages
