[![NPM Downloads](https://img.shields.io/npm/dw/%40inlang%2Fparaglide-js?logo=npm&logoColor=red&label=npm%20downloads)](https://www.npmjs.com/package/@inlang/paraglide-js)
[![GitHub Issues](https://img.shields.io/github/issues-closed/opral/paraglide-js?logo=github&color=purple)](https://github.com/opral/paraglide-js/issues)
[![Contributors](https://img.shields.io/github/contributors/opral/paraglide-js?logo=github)](https://github.com/opral/paraglide-js/graphs/contributors)
[![Discord](https://img.shields.io/discord/897438559458430986?logo=discord&logoColor=white&label=discord)](https://discord.gg/gdMPPWy57R)

<h1 align="center">🪂 Paraglide JS</h1>
<p align="center">
  <strong>Compiler-based i18n library that emits tree-shakable translations, leading to up to 70% smaller i18n bundle sizes.</strong>
</p>

<p align="center">
  <a href="https://inlang.com/m/gerre34r/library-inlang-paraglideJs"><strong>Documentation</strong></a> ·
  <a href="#quick-start"><strong>Quick Start</strong></a> ·
  <a href="https://github.com/opral/inlang-paraglide-js/issues"><strong>Report Bug</strong></a>
</p>

<p align="center">
  <sub>Used in production by</sub><br/><br/>
  <a href="https://michelin.com"><img src="https://www.google.com/s2/favicons?domain=michelin.com&sz=32" alt="Michelin" height="24" /></a>&nbsp;&nbsp;&nbsp;
  <a href="https://idealista.com"><img src="https://www.google.com/s2/favicons?domain=idealista.com&sz=32" alt="Idealista" height="24" /></a>&nbsp;&nbsp;&nbsp;
  <a href="https://architonic.com"><img src="https://www.google.com/s2/favicons?domain=architonic.com&sz=32" alt="Architonic" height="24" /></a>&nbsp;&nbsp;&nbsp;
  <a href="https://0.email"><img src="https://www.google.com/s2/favicons?domain=0.email&sz=32" alt="0.email" height="24" /></a>&nbsp;&nbsp;&nbsp;
  <sub>...and more</sub>
</p>

<p align="center">
  <sub>Trusted by framework authors</sub><br/><br/>
  <a href="https://svelte.dev/docs/cli/paraglide"><img src="https://cdn.simpleicons.org/svelte/FF3E00" alt="Svelte" height="14" /> SvelteKit's official i18n integration</a><br/>
  <a href="https://inlang.com/blog/tanstack-ci"><img src="https://tanstack.com/images/logos/logo-color-100.png" alt="TanStack" height="14" /> Part of TanStack's CI pipeline</a>
</p>

## Code Preview

```js
// messages/en.json
{
  "greeting": "Hello {name}!"
}
```

```js
import { m } from "./paraglide/messages.js";

m.greeting({ name: "World" }); // "Hello World!" — fully typesafe
```

The compiler generates typed message functions. Your bundler tree-shakes unused messages. Expect [**up to 70% smaller i18n bundle sizes**](https://inlang.com/m/gerre34r/library-inlang-paraglideJs/benchmark) compared to runtime i18n libraries (e.g. 47 KB vs 205 KB).

## Why Paraglide?

|                           |                                                                                                                                                                                                                |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Smaller i18n Bundle**   | Up to 70% smaller i18n bundle size than runtime i18n libraries.                                                                                                                                                                 |
| **Tree-Shakable**         | Unused messages are eliminated by your bundler.                                                                                                                                                                |
| **Fully Typesafe**        | Autocomplete for message keys and parameters. Typos become compile errors.                                                                                                                                     |
| **Framework Agnostic**    | Works with React, Vue, Svelte, Solid, TanStack, or vanilla JS/TS.                                                                                                                                              |
| **Built-in i18n Routing** | URL-based locale detection and localized paths out of the box.                                                                                                                                                 |
| **Built on inlang**       | Integrates with [Sherlock](https://inlang.com/m/r7kp499g/app-inlang-ideExtension) (VS Code extension), [Fink](https://inlang.com/m/tdozzpar/app-inlang-finkLocalizationEditor) (translation editor), and more. |

## Works With Your Stack

<p>
  <a href="https://inlang.com/m/gerre34r/library-inlang-paraglideJs/vite"><img src="https://cdn.simpleicons.org/react/61DAFB" alt="React" width="18" height="18" /> React</a> ·
  <a href="https://inlang.com/m/gerre34r/library-inlang-paraglideJs/vite"><img src="https://cdn.simpleicons.org/vuedotjs/4FC08D" alt="Vue" width="18" height="18" /> Vue</a> ·
  <a href="https://github.com/TanStack/router/tree/main/examples/react/start-i18n-paraglide"><img src="https://tanstack.com/images/logos/logo-color-100.png" alt="TanStack" width="18" height="18" /> TanStack Start</a> ·
  <a href="https://inlang.com/m/gerre34r/library-inlang-paraglideJs/sveltekit"><img src="https://cdn.simpleicons.org/svelte/FF3E00" alt="Svelte" width="18" height="18" /> SvelteKit</a> ·
  <a href="https://inlang.com/m/gerre34r/library-inlang-paraglideJs/react-router"><img src="https://cdn.simpleicons.org/reactrouter/CA4245" alt="React Router" width="18" height="18" /> React Router</a> ·
  <a href="https://inlang.com/m/gerre34r/library-inlang-paraglideJs/astro"><img src="https://cdn.simpleicons.org/astro/FF5D01" alt="Astro" width="18" height="18" /> Astro</a> ·
  <a href="https://inlang.com/m/gerre34r/library-inlang-paraglideJs/vanilla-js-ts"><img src="https://cdn.simpleicons.org/javascript/F7DF1E" alt="JavaScript" width="18" height="18" /> Vanilla JS/TS</a>
</p>

> [!TIP]
> <img src="https://vitejs.dev/logo.svg" alt="Vite" width="16" height="16" /> **Paraglide is ideal for any Vite based app.** Setup is just one plugin and Vite's tree-shaking eliminates unused messages automatically. [Get started →](https://inlang.com/m/gerre34r/library-inlang-paraglideJs/vite)

## Quick Start

```bash
npx @inlang/paraglide-js init
```

The CLI sets up everything:

- Creates your message files
- Configures your bundler (Vite, Webpack, etc.)
- Generates typesafe message functions

Then use your messages:

```js
import { m } from "./paraglide/messages.js";
import { setLocale, getLocale } from "./paraglide/runtime.js";

// Use messages (typesafe, with autocomplete)
m.hello_world();
m.greeting({ name: "Ada" });

// Get/set locale
getLocale(); // "en"
setLocale("de"); // switches to German
```

**[Full Getting Started Guide →](https://inlang.com/m/gerre34r/library-inlang-paraglideJs)**

## How It Works

Paraglide compiles an [inlang project](https://inlang.com/docs/introduction#how-it-works) into tree-shakable message functions. Your bundler eliminates unused messages at build time.

```
       ┌────────────────┐
       │ Inlang Project │
       └───────┬────────┘
               │
               ▼
  ┌────────────────────────┐
  │  Paraglide Compiler    │
  └───────────┬────────────┘
              │
              ▼
 ┌──────────────────────────┐
 │ ./paraglide/messages.js  │
 │ ./paraglide/runtime.js   │
 └──────────────────────────┘
```

[Watch: How Paraglide JS works in 6 minutes →](https://www.youtube.com/watch?v=PBhdb5AS0mk)

## Message Format

Paraglide uses `Intl.PluralRules` for locale-aware pluralization, supporting all CLDR plural categories (zero, one, two, few, many, other) and ordinals (1st, 2nd, 3rd). Gender and custom selects are supported via the variants system.

```js
// Pluralization example
m.items_in_cart({ count: 1 }); // "1 item in cart"
m.items_in_cart({ count: 5 }); // "5 items in cart"

// Works correctly for complex locales (Russian, Arabic, etc.)
```

Message format is **plugin-based** — use the default inlang format, or switch to i18next, JSON, or ICU MessageFormat via [plugins](https://inlang.com/c/plugins). If your team relies on ICU MessageFormat 1 syntax, use the [inlang-icu-messageformat-1 plugin](https://inlang.com/m/p7c8m1d2/plugin-inlang-icu-messageformat-1).

**[Pluralization & Variants Docs →](https://inlang.com/m/gerre34r/library-inlang-paraglideJs/variants)**

## Comparison

| Feature                | Paraglide                          | i18next               | react-intl            |
| ---------------------- | ---------------------------------- | --------------------- | --------------------- |
| **i18n bundle size**   | Up to 70% smaller via tree-shaking | ❌ Ships all messages | ❌ Ships all messages |
| **Tree-shakable**      | ✅                                 | ❌                    | ❌                    |
| **Typesafe**           | ✅                                 | Partial               | ❌                    |
| **Framework agnostic** | ✅                                 | Wrappers needed       | React only            |
| **i18n routing**       | ✅ Built-in                        | ❌                    | ❌                    |

**[Full Comparison →](https://inlang.com/m/gerre34r/library-inlang-paraglideJs/comparison)**

## What Developers Say

> **"Paraglide JS is by far the best option when it comes to internationalization. Nothing better on the market."**
>
> Ancient-Background17 · Reddit

> **"Just tried Paraglide JS. This is how i18n should be done! Totally new level of DX."**
>
> Patrik Engborg · [@patrikengborg](https://twitter.com/patrikengborg/status/1747260930873053674)

> **"I was messing with various i18n frameworks and must say Paraglide was the smoothest experience. SSG and SSR worked out of the box."**
>
> Dalibor Hon · Discord

> **"I migrated from i18next. Paraglide reduced my i18n bundle from 40KB to ~2KB."**
>
> Daniel · [Why I Replaced i18next with Paraglide JS](https://dropanote.de/en/blog/20250726-why-i-replaced-i18next-with-paraglide-js/)

## Talks

- [Paraglide JS 1.0 announcement](https://www.youtube.com/watch?v=-YES3CCAG90)
- [Svelte London January 2024 Meetup](https://www.youtube.com/watch?v=eswNQiq4T2w&t=646s)

## Ecosystem

Paraglide is built on the [open inlang format](https://github.com/opral/inlang-sdk). Works with:

| Tool                                                                    | Description                                      |
| ----------------------------------------------------------------------- | ------------------------------------------------ |
| [Sherlock](https://inlang.com/m/r7kp499g/app-inlang-ideExtension)       | VS Code extension for inline translation editing |
| [CLI](https://inlang.com/m/2qj2w8pu/app-inlang-cli)                     | Machine translate from the terminal              |
| [Fink](https://inlang.com/m/tdozzpar/app-inlang-finkLocalizationEditor) | Translation editor for non-developers            |
| [Parrot](https://inlang.com/m/gkrpgoir/app-parrot-figmaPlugin)          | Manage translations in Figma                     |

**[Explore the inlang ecosystem →](https://inlang.com/c/apps)**

## Documentation

- [Getting Started](https://inlang.com/m/gerre34r/library-inlang-paraglideJs)
- [Framework Guides](https://inlang.com/m/gerre34r/library-inlang-paraglideJs/react-router) (React Router, SvelteKit, Astro, etc.)
- [Message Syntax & Pluralization](https://inlang.com/m/gerre34r/library-inlang-paraglideJs/variants)
- [Routing & SSR](https://inlang.com/m/gerre34r/library-inlang-paraglideJs/server-side-rendering)
- [API Reference](https://inlang.com/m/gerre34r/library-inlang-paraglideJs)

## Contributing

We welcome contributions! See [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.

- [GitHub Issues](https://github.com/opral/inlang-paraglide-js/issues)
- [Discord Community](https://discord.gg/gdMPPWy57R)

## License

MIT — see [LICENSE](./LICENSE)
