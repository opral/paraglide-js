---
title: Basics
description: Learn Paraglide JS basics - import messages, use parameters, manage locales, and add type-safe i18n to any app.
---

# Basics

New to Paraglide? [Watch how it works in 6 minutes →](https://www.youtube.com/watch?v=PBhdb5AS0mk)

## Using messages

Import messages from the generated `messages.js` file:

```js
import { m } from "./paraglide/messages.js";

m.hello_world(); // "Hello World!"
```

## Parameters

Pass parameters as an object:

```js
// messages/en.json: { "greeting": "Hello {name}!" }

m.greeting({ name: "Samuel" }); // "Hello Samuel!"
```

## Getting and setting the locale

```js
import { getLocale, getTextDirection, setLocale } from "./paraglide/runtime.js";

getLocale(); // "en"
getTextDirection(); // "ltr" or "rtl" for current locale
setLocale("de"); // Updates the locale and starts a document navigation
```

> [!NOTE]
> Locale switching uses a full document navigation, not framework reactivity. By default, `setLocale()` updates the configured locale strategies and then navigates to the localized URL when URL routing is enabled; otherwise, it reloads the current document. The new document renders the app and any document-level locale settings together.

### Advanced: stay on the current document

> [!WARNING]
> `setLocale(locale, { reload: false })` is a client-only escape hatch, not a normal locale picker. It updates the configured locale strategies but does not re-render your framework, navigate to the localized URL, or update document state such as `<html lang>`, `dir`, title, or metadata.
>
> Use it only for a fully client-rendered surface that you own and that must preserve non-restorable in-memory work—for example, an embedded widget, browser-extension options page, or persistent authoring or real-time workspace. If a custom strategy makes `setLocale()` asynchronous, await it before triggering every locale-dependent UI update through your own reactive state and synchronizing the document or root state you own.
>
> Do **not** use it for an ordinary locale picker or to switch an SSR-, SSG-, or hydrated document. Never use it on a route whose active locale strategy includes `url`, or with `experimentalPerLocaleBuild`. With the `url` strategy, it leaves the old URL and document shell in place, so `getLocale()` can keep resolving the old locale; use a full document navigation instead.

```js
await setLocale("de", { reload: false });
```

## Forcing a locale

Override the locale for a specific message:

```js
m.greeting({ name: "Samuel" }, { locale: "de" }); // "Hallo Samuel!"
```

> [!TIP]
> Useful for server-side rendering where you might need to render content in multiple languages.

## Routing

Use `localizeHref()` for URL localization. Works with any framework:

```js
import { localizeHref } from "./paraglide/runtime.js";

localizeHref("/blog"); // "/en/blog" or "/de/blog" depending on locale
```

```html
<!-- React/Solid/Vue/Svelte/etc. -->
<a href={localizeHref("/blog")}>Blog</a>
```

> [!NOTE]
> If you route to a different locale, ensure a reload happens afterwards. See [switching locales via links](./errors#switching-locales-via-links-doesnt-work).

---

## Adding messages

Messages are stored in `messages/{locale}.json`:

`messages/en.json`

```json
{
	"greeting": "Hello {name}!"
}
```

`messages/de.json`

```json
{
	"greeting": "Hallo {name}!"
}
```

> [!NOTE]
> These examples use the default inlang message format. Paraglide works with any format plugin—see the [plugin directory](https://inlang.com/c/plugins).

## Adding locales

Add locales in `project.inlang/settings.json`:

```json
{
	"baseLocale": "en",
	"locales": ["en", "de", "fr"]
}
```

---

## Additional features

### Message keys

Paraglide supports nested keys through bracket notation but recommends flat keys. For new messages, prefer stable random human-readable keys:

Flat random key (recommended):

```json
{
	"calm_green_otter": "User Profile"
}
```

```js
m.calm_green_otter();
```

Existing nested keys are also supported:

```json
{
	"user": { "profile": { "title": "User Profile" } }
}
```

```js
m["user.profile.title"]();
```

See [message keys](./message-keys) for the key-naming rationale and structure options.

### Dynamic messages

A runtime string from an API or JSON does not change which messages your UI supports. Define those messages explicitly so the bundler can remove the rest of the catalog:

```ts
import { m } from "./paraglide/messages.js";

const statusMessages = new Map([
	["pending", m.order_pending],
	["paid", m.order_paid],
	["failed", m.order_failed],
]);

const message = statusMessages.get(status) ?? m.order_unknown;
message();
```

Use typed wrapper functions in the map when messages need different inputs. Unknown values should use a fallback. Avoid `m[name]()` or ``m[`${name}_label`]()``: a bundler may retain every message because it cannot know which key will be used. Referencing each message directly also lets [`inlang check`](./checking-translations#unused-messages) find unused messages.

#### ESLint and Oxlint

During interactive `paraglide-js init`, you can opt into ESLint or Oxlint message linting. For coding agents or CI, choose explicitly:

```sh
npx @inlang/paraglide-js init --yes --lint eslint
# Alternatively: --lint oxlint
```

Init adds a dedicated `lint:i18n` script and `eslint.paraglide.config.mjs` or `.oxlintrc.paraglide.json`, preserving existing lint configurations and scripts. Install dependencies, then run `npm run lint:i18n`. The generated ESLint config handles JavaScript and TypeScript with a syntax-only parser; framework component files still need their existing framework lint integration. With no `--lint` choice, unattended init skips lint setup.

`--yes` (also `--non-interactive`) never opens prompts. The default project and output paths are `./project.inlang` and `./src/paraglide`; override them with `--project` and `--outdir`. It reuses existing projects, auto-detects Vite or adds a build-time compile command, enables TypeScript `allowJs` where needed while preserving comments, and retains the existing default translation check setup (`--no-check` skips it). Editor recommendations and machine translation are off unless explicitly selected. `--allow-dirty` is required for uncommitted changes. `--no-compile` defers the initial compile until dependencies are installed. Init does not install dependencies itself. Invalid options/configuration conflicts fail with a nonzero exit status; compilation failures also fail in unattended mode and report that setup files have already been written.

The optional plugin reports dynamic catalog access and whole-catalog spread/rest copies. It allows static access such as `m.greeting()` and `m["user.profile.title"]()`, plus indexing an application-owned map. The rule does not guess the keys the UI supports and has no automatic fix.

With ESLint 9 or 10, add it to your existing flat config:

```js
// eslint.config.js
import paraglide from "@inlang/paraglide-js/eslint";

export default [
	{
		plugins: { paraglide },
		rules: { "paraglide/no-dynamic-message-access": "error" },
	},
];
```

Keep your existing language/parser configuration for TypeScript or framework files. ESLint is an optional peer dependency; applications that do not use the plugin do not need to install it.

Oxlint can run the same plugin through its JavaScript plugin API (tested with Oxlint 1.88):

```json
{
	"jsPlugins": [
		{ "name": "paraglide", "specifier": "@inlang/paraglide-js/eslint" }
	],
	"rules": { "paraglide/no-dynamic-message-access": "error" }
}
```

By default, the rule recognizes imports ending in `paraglide/messages` or `paraglide/messages.js`, including aliases such as `$lib/paraglide/messages`. For a custom output directory or re-export module, add the exact import specifier:

```js
"paraglide/no-dynamic-message-access": [
  "error",
  { messageModules: ["@app/translations", "./generated/messages.js"] },
]
```

Generated lint configs use `messageModuleDirectories` to recognize the output folder name (for example, `["i18n"]` for `./src/i18n`). For unusual aliases or re-export modules, `messageModules` adds exact import specifiers. The same rule options work in Oxlint. This is a syntax/scope check, not a guarantee about the final bundle: it follows local `const` aliases but does not evaluate key expressions, resolve re-exports across files, or follow a catalog passed through function arguments. Configure each import path used for the catalog. Oxlint's JavaScript plugin support is still alpha and does not yet support custom framework parsers; use ESLint with the relevant parser for those files.

### Type-safe localized strings

Message functions return `LocalizedString`, a special string type that TypeScript uses to distinguish translated text from regular strings:

```ts
import type { LocalizedString } from "./paraglide/runtime.js";

function PageTitle(props: { title: LocalizedString }) {
  return <h1>{props.title}</h1>;
}

<PageTitle title={m.welcome_title()} />  // ✅
<PageTitle title="Welcome" />            // ❌ Type error
```

## Next steps

- [Formatting](./formatting) - Number/date formatting with `number` and `datetime`
- [Strategy](./strategy) - Configure locale detection
- [i18n Routing](./i18n-routing) - URL patterns, translated pathnames, domain-based routing
- [Middleware](./middleware) - Server-side integration
- [Server-Side Rendering](./server-side-rendering) - Dynamic rendering with middleware
- [Static Site Generation](./static-site-generation) - Build-time page generation
