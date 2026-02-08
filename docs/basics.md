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
import { getLocale, setLocale } from "./paraglide/runtime.js";

getLocale(); // "en"
setLocale("de"); // Changes locale and reloads page
```

> [!NOTE]
> `setLocale()` triggers a page reload by default. This is a deliberate design choice that keeps the implementation simple without framework-specific logic for preserving form state, scroll position, etc. A user switches the language once, so optimizing for instant locale switching is a poor trade-off. YouTube and other major sites work the same way.

To change without reload:

```js
setLocale("de", { reload: false });
```

You'll need to trigger a re-render of your component tree using your framework's reactivity (e.g., React state, Svelte stores, Vue refs).

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

Paraglide supports nested keys through bracket notation but recommends flat keys:

Flat keys (recommended):

```json
{
  "user_profile_title": "User Profile"
}
```

```js
m.user_profile_title();
```

Nested keys:

```json
{
  "user": { "profile": { "title": "User Profile" } }
}
```

```js
m["user.profile.title"]();
```

See [message keys](./message-keys) for best practices.

### Dynamic messages

Specify messages beforehand to preserve tree-shaking:

```ts
const messages = {
  greeting: m.greeting,
  goodbye: m.goodbye,
};

messages["greeting"](); // "Hello World!"
```

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
