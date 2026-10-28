---
title: React + Vite i18n with Paraglide JS
description: Add type-safe translations to React and Vite with Paraglide JS. Set up JSON messages, a language switcher, document language, and production builds.
og:title: Paraglide JS for React + Vite
---

# React + Vite i18n with Paraglide JS

Paraglide JS is a compiler-first internationalization library for React and Vite. It turns translation files into typed JavaScript functions that you import directly into components. You get autocomplete for message keys and parameters, and Vite can tree-shake unused messages. Plain-text messages need no React provider, translation hook, or React-specific runtime package.

This guide builds a client-rendered React app with JSON translation files and a language switcher. For server rendering and localized routes, use the [TanStack Start guide](https://paraglidejs.com/tanstack-start) or [React Router guide](https://paraglidejs.com/react-router).

**[Runnable React example](https://github.com/opral/paraglide-js/tree/main/examples/react)** · **[Compare with react-i18next](https://paraglidejs.com/paraglide-vs-react-i18next)** · **[Bundle benchmark and methodology](https://paraglidejs.com/benchmark)**

## 1. Create or open a React + Vite app

For a new TypeScript app:

```sh
npm create vite@latest my-react-app -- --template react-ts
cd my-react-app
npm install
```

In an existing React + Vite app, start from its root directory. The configuration below uses `@vitejs/plugin-react`; keep your existing React plugin if your app uses another supported Vite integration.

## 2. Install Paraglide

```sh
npm install --save-dev @inlang/paraglide-js
```

The following steps configure the project manually. Alternatively, `npx @inlang/paraglide-js@latest init` can create the project and add the Vite plugin for you; inspect its changes before continuing rather than adding a second plugin instance. The CLI does not install dependencies for you.

## 3. Add your locales and translation files

Create `project.inlang/settings.json`:

```json
{
  "$schema": "https://inlang.com/schema/project-settings",
  "baseLocale": "en",
  "locales": ["en", "de"],
  "modules": [
    "https://cdn.jsdelivr.net/npm/@inlang/plugin-message-format@4.5.0/dist/index.js"
  ],
  "plugin.inlang.messageFormat": {
    "pathPattern": "./messages/{locale}.json"
  }
}
```

Create `messages/en.json`:

```json
{
  "greeting": "Hello {name}!"
}
```

Create `messages/de.json`:

```json
{
  "greeting": "Hallo {name}!"
}
```

Your translations stay in these version-controlled JSON files. `project.inlang` contains configuration such as locales and format plugins; it does not require moving translations to a hosted service or adopting a proprietary binary catalog.

## 4. Configure the Vite plugin

Keep your existing Vite configuration and add Paraglide once. A minimal `vite.config.ts` looks like this:

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { paraglideVitePlugin } from "@inlang/paraglide-js";

export default defineConfig({
  plugins: [
    react(),
    paraglideVitePlugin({
      project: "./project.inlang",
      outdir: "./src/paraglide",
      emitTsDeclarations: true,
      strategy: ["cookie", "baseLocale"],
    }),
  ],
});
```

The cookie remembers the selected locale; `baseLocale` supplies English when no selection exists. This setup keeps the current URL when changing languages. Use the [URL strategy](https://paraglidejs.com/strategy#url) when each language needs a different public URL.

`emitTsDeclarations` requires TypeScript 5.6 or newer. It generates declarations so React/TypeScript editors can discover message keys and parameters. Generated implementation files are JavaScript. Keep `allowJs: true` in the TypeScript configuration that includes `src` if your toolchain needs to resolve those files. JavaScript apps can use `emitTsDeclarations: false` and the generated JSDoc types instead.

Add `/src/paraglide` to `.gitignore`. Edit the translation files, not the generated output.

## 5. Render translations and switch languages

Replace `src/App.tsx` with:

```tsx
import { m } from "./paraglide/messages.js";
import { getLocale, locales, setLocale } from "./paraglide/runtime.js";

export default function App() {
  return (
    <main>
      <h1>{m.greeting({ name: "World" })}</h1>
      <nav aria-label="Language">
        {locales.map((locale) => (
          <button
            key={locale}
            type="button"
            aria-pressed={getLocale() === locale}
            onClick={() => setLocale(locale)}
          >
            {locale.toUpperCase()}
          </button>
        ))}
      </nav>
    </main>
  );
}
```

Message keys and parameters come from your files: `m.greeting({ name: "World" })` is typed, including the required `name` parameter. Run TypeScript checking in CI to catch invalid calls; Vite's bundling alone does not perform type checking.

By default, `setLocale()` persists the selection and performs a full document navigation. With this cookie-based setup it reloads the current page, and React renders the newly selected language. With the URL strategy it navigates to the localized URL. Save important unsaved work before switching languages.

Do not add React state just to force the standard language picker to re-render. `setLocale(locale, { reload: false })` does not update React, the URL, or document metadata for you; it is a narrow browser-only escape hatch. Read the [locale switching constraints](https://paraglidejs.com/basics#advanced-stay-on-the-current-document) before considering it.

## 6. Set the document language and direction

In `src/main.tsx`, set document attributes before mounting React:

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { getLocale, getTextDirection } from "./paraglide/runtime.js";

document.documentElement.lang = getLocale();
document.documentElement.dir = getTextDirection();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
```

This updates the browser document in a client-rendered app. It does not translate the initial HTML returned by your host. For localized HTML, metadata, and SEO, use SSR or SSG and set `lang` and `dir` during rendering. Follow your framework's guide rather than applying this browser-only bootstrap to hydrated HTML.

## 7. Run and build

```sh
npm run dev
```

The Vite plugin compiles messages for development and production builds. After opening the app, choose DE: the page reloads and the heading becomes `Hallo World!`. Refresh again to check that the selection persists.

```sh
npm run build
npm run preview
```

Use your app's TypeScript check as well, such as `npx tsc --noEmit` for a single-config project or `npx tsc -b` for Vite's project-reference template.

## Generated files and CI

The plugin regenerates output during development and builds. Its generated `.gitignore` ignores the output directory by default, so commit your source translations and configuration rather than regenerated JavaScript. On a fresh checkout, compile before a TypeScript check that needs the generated imports. See [build workflow, Git, and CI](https://paraglidejs.com/build-workflow) for the exact sequence and a reproducible tree-shaking probe.

## Rich text, plurals, and existing catalogs

- **Rich text:** use the [React markup adapter](https://paraglidejs.com/markup) when translators need to position links or emphasis. It maps named markup to React elements; avoid inserting translated HTML through `dangerouslySetInnerHTML`.
- **Plurals and selection:** use [variants](https://paraglidejs.com/variants) for plural categories, gender, and other message choices. ICU MessageFormat 1 syntax is available through the [ICU plugin](https://inlang.com/m/p7c8m1d2/plugin-inlang-icu-messageformat-1); it is not the default message format's syntax.
- **Existing i18next JSON:** configure the [i18next format plugin](https://inlang.com/m/3i8bor92/plugin-inlang-i18next) and migrate call sites incrementally. You do not need to rewrite every translation before trying Paraglide. See [incremental migration](https://paraglidejs.com/incremental-migration).

## Bundle size and loading tradeoffs

Import message functions by static key, such as `m.greeting()`. Vite can eliminate unreferenced message functions. Avoid `m[key]()` with an unrestricted runtime string or copying the entire message catalog: that can keep messages you never render in the bundle. Use an explicit application-owned map for a finite set of dynamic choices; see [dynamic messages](https://paraglidejs.com/basics#dynamic-messages).

Removing unused messages and loading only the active locale are different optimizations. The default output includes the configured locales for each retained message. For large locale sets, evaluate [experimental locale splitting](https://paraglidejs.com/compiling-messages) against your actual app. The [published benchmark](https://paraglidejs.com/benchmark) documents its configurations and measures total transferred bytes; its results are not a fixed library-only size or a promise for every React app.

## When is Paraglide a good fit for React?

Paraglide fits React + Vite apps whose UI messages are known at build time and whose teams want typed function calls, static imports, and no translation provider for plain text. It also lets you share the same message API with other frameworks.

Evaluate runtime-oriented alternatives if your app must introduce arbitrary new translation keys without rebuilding, depends on specific i18next runtime plugins, or requires an in-place locale transition that preserves all React state. See the [React i18n comparison](https://paraglidejs.com/paraglide-vs-react-i18next) for the tradeoffs.

## Troubleshooting

### The generated message import does not exist

Start the Vite dev server or run a build after adding the plugin. Check that `outdir` matches your imports and that `project.inlang/settings.json` points to your translation files. Generated files are build output, so they may be absent after a fresh checkout until compilation runs.

### New keys are missing from editor autocomplete

Keep Vite running while editing translations. Check `emitTsDeclarations`, your TypeScript version, and that the message exists in your base locale. Restart the TypeScript language server if it retains stale declarations.

### The locale changes but some content stays in the old language

Use the default `setLocale(locale)` navigation behavior. Check for hard-coded text and application caches. If your app opts out of reloading, you own the reactive updates and document synchronization described in Basics.

### I need server-rendered pages or localized routes

Use the [TanStack Start](https://paraglidejs.com/tanstack-start) or [React Router](https://paraglidejs.com/react-router) integration for request-scoped locale handling. For a plain Vite SPA, your host also needs the appropriate history fallback when using localized paths; the compiler does not configure your hosting routes.

