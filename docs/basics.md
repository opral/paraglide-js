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

Specify messages beforehand to preserve tree-shaking:

```ts
const messages = {
  greeting: m.greeting,
  goodbye: m.goodbye,
};

messages["greeting"](); // "Hello World!"
```

Referencing each message directly also lets [`inlang check`](./checking-translations#unused-messages) find unused messages. A key built at runtime, such as ``m[`${name}_label`]``, can't be resolved.

For arbitrary keys, the default `message-groups` compiler output includes `dynamic.js`:

```ts
import { getMessage } from "./paraglide/dynamic.js";

await getMessage("greeting", { name: "Ada" }, { locale: "de" });
await getMessage("goodbye");
await getMessage("goodbye", {}, { locale: "de" });
```

`getMessage()` imports the sorted group containing the requested key. Each message lives in one group, containing its locale variants. A lookup also loads other messages in that group, while other groups remain unloaded. Group sizes adapt to the catalog: up to 64 messages and approximately 64 KiB of generated source per group, with oversized messages kept intact. Modules are cached by the JavaScript module loader. Each call formats its own inputs and captures the current or explicit locale before loading. As with ordinary message calls, `experimentalStaticLocale` takes precedence when configured at compile time.

Literal keys and their inputs are type-checked. A widened `string` from JSON or another runtime source opts out of key-specific input checking. The loader checks that the key exists; callers must supply the inputs that message requires. Input shapes are not validated at runtime. Unknown keys and module loading failures reject with `MessageLoadError`, which exposes `key`, `locale` and `cause`. Invalid locales and formatting errors also reject the promise.

**Deployment:** literal imports let ordinary bundler builds discover the groups and emit lazy chunks. Native ESM deployments serve the generated folder with its relative layout preserved and a JavaScript MIME type. Node uses an ESM package scope (for example, `"type": "module"` in `package.json`). Keep the complete set of groups available for dynamic keys.

`messages.js` continues to expose synchronous `m.*` functions from the same groups. Static imports remain tree-shakeable; async lookup retains each requested group's functions. `getMessage()` is available with `message-groups`; explicitly selecting the legacy `message-modules` or `locale-modules` layout does not emit `dynamic.js`. Dynamic keys cannot be resolved by unused-message analysis.

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
