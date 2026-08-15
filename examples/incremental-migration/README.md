---
title: Incremental Migration - Use Paraglide JS with Existing Translation Files
description: Paraglide JS compiles any translation file format via inlang plugins. Run Paraglide alongside i18next, react-intl, or any i18n library using the same translation files.
---

# Incremental Migration

Paraglide JS compiles any translation file format via [inlang plugins](https://inlang.com/c/plugins). This means you can run Paraglide alongside your existing i18n library—both reading from the same translation files.

## Why adopt Paraglide JS?

- **Type safety** — Autocomplete for message keys and parameters, compile-time errors for typos
- **Smaller bundles** — Tree-shaking removes unused translations, up to 70% smaller i18n bundle sizes
- **Better DX** — Your IDE knows every message key and its parameters

## How it works

- **No translation file migration** — Paraglide reads your existing i18next, react-intl, or custom JSON files directly
- **Run both libraries in parallel** — Use Paraglide in new code while existing code keeps working
- **Gradual adoption** — Convert components at your own pace, or keep both forever
- **Same source of truth** — Both libraries read from the same translation files

> [!NOTE]
> This example uses i18next translation files, but the same approach works with any format that has an [inlang plugin](https://inlang.com/c/plugins).

## Setup

### 1. Install Paraglide JS

```bash
npx @inlang/paraglide-js@latest init
```

### 2. Add a plugin for your translation format

Paraglide uses [inlang plugins](https://inlang.com/c/plugins) to read translation files. Add the plugin that matches your existing format to `project.inlang/settings.json`:

```diff
{
  "baseLocale": "en",
  "locales": ["en", "de", "fr"],
  "modules": [
-    "https://cdn.jsdelivr.net/npm/@inlang/message-format-plugin@latest/dist/index.js"
+    "https://cdn.jsdelivr.net/npm/@inlang/plugin-i18next@6.0.11/dist/index.js"
  ],
+  "plugin.inlang.i18next": {
+    "pathPattern": "./locales/{locale}.json"
+  }
}
```

Now Paraglide compiles your existing i18next translation files into typed message functions.

### 3. Use both libraries together

Both libraries read from the same translation files:

```js
import i18next from 'i18next';
import { m } from './paraglide/messages.js';

// Same translation, two ways to access it
i18next.t('greeting', { name: 'World' });  // i18next (runtime)
m.greeting({ name: 'World' });              // Paraglide (compiled, typesafe)
```

Use Paraglide in new code. Existing i18next code keeps working unchanged.

[Learn more about messages, parameters, and locale management →](/basics)

## Further reading

- [Translation File Formats](/file-formats) — All supported formats and plugins
- [Comparison with i18next](/comparison) — Feature-by-feature comparison
- [Why I Replaced i18next with Paraglide JS](https://dropanote.de/en/blog/20250726-why-i-replaced-i18next-with-paraglide-js/) — One developer's experience
