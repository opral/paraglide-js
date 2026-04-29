[![NPM Downloads](https://img.shields.io/npm/dw/%40inlang%2Fparaglide-js?logo=npm&logoColor=red&label=npm%20downloads)](https://www.npmjs.com/package/@inlang/paraglide-js)
[![GitHub Issues](https://img.shields.io/github/issues-closed/opral/paraglide-js?logo=github&color=purple)](https://github.com/opral/paraglide-js/issues)
[![Contributors](https://img.shields.io/github/contributors/opral/paraglide-js?logo=github)](https://github.com/opral/paraglide-js/graphs/contributors)
[![Discord](https://img.shields.io/discord/897438559458430986?logo=discord&logoColor=white&label=discord)](https://discord.gg/gdMPPWy57R)

<h1 align="center">🪂 Paraglide JS</h1>
<p align="center">
  <strong>Compiler-first i18n for TanStack Start, SvelteKit, and Vite apps.</strong>
  <br/>
  Type-safe message functions, tree-shakable translations, and first-class SSR.
</p>

<p align="center">
  <a href="https://inlang.com/m/gerre34r/library-inlang-paraglideJs"><strong>Documentation</strong></a> ·
  <a href="#quick-start"><strong>Quick Start</strong></a> ·
  <a href="https://github.com/opral/inlang-paraglide-js/issues"><strong>Report Bug</strong></a>
</p>

<p align="center">
  <sub>Used in production by</sub><br/><br/>
  <a href="https://www.kraftheinz.com/"><img src="https://github.com/opral/paraglide-js/blob/main/assets/used-by/kraft-heinz.png?raw=true" alt="Kraft Heinz" height="18"></a>&nbsp;&nbsp;&nbsp;
  <a href="https://www.bose.com/"><img src="https://github.com/opral/paraglide-js/blob/main/assets/used-by/bose.svg?raw=true" alt="Bose" height="18"></a>&nbsp;&nbsp;&nbsp;
  <a href="https://www.disney.co.jp/"><img src="https://github.com/opral/paraglide-js/blob/main/assets/used-by/disney.svg?raw=true" alt="Disney" height="18"></a>&nbsp;&nbsp;&nbsp;
  <a href="https://ethz.ch/de.html"><img src="https://github.com/opral/paraglide-js/blob/main/assets/used-by/eth-zurich.svg?raw=true" alt="ETH Zurich" height="18"></a>&nbsp;&nbsp;&nbsp;
  <a href="https://brave.com/"><img src="https://github.com/opral/paraglide-js/blob/main/assets/used-by/brave.svg?raw=true" alt="Brave" height="18"></a>&nbsp;&nbsp;&nbsp;
  <a href="https://www.michelin.com/"><img src="https://github.com/opral/paraglide-js/blob/main/assets/used-by/michelin.svg?raw=true" alt="Michelin" height="18"></a>&nbsp;&nbsp;&nbsp;
  <a href="https://www.idealista.com/"><img src="https://github.com/opral/paraglide-js/blob/main/assets/used-by/idealista.svg?raw=true" alt="idealista" height="18"></a>&nbsp;&nbsp;&nbsp;
  <a href="https://www.architonic.com/"><img src="https://github.com/opral/paraglide-js/blob/main/assets/used-by/architonic.png?raw=true" alt="Architonic" height="18"></a>&nbsp;&nbsp;&nbsp;
  <a href="https://www.finanzen100.de/"><img src="https://github.com/opral/paraglide-js/blob/main/assets/used-by/finanzen100.png?raw=true" alt="Finanzen100" height="18"></a>&nbsp;&nbsp;&nbsp;
  <a href="https://0.email/"><img src="https://github.com/opral/paraglide-js/blob/main/assets/used-by/zero-email.svg?raw=true" alt="0.email" height="18"></a>
</p>

<p align="center">
  <sub>Framework-authored and framework-tested</sub><br/><br/>
  <a href="https://svelte.dev/docs/cli/paraglide"><img src="https://cdn.simpleicons.org/svelte/FF3E00" alt="Svelte" height="14" /> SvelteKit's official i18n integration</a><br/>
  <a href="https://inlang.com/blog/tanstack-ci"><img src="https://tanstack.com/images/logos/logo-color-100.png" alt="TanStack" height="14" /> TanStack Router's e2e-tested i18n example</a>
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

The compiler turns your messages into typed ESM functions. Vite, Rollup, and other modern bundlers can tree-shake unused translations before they reach the browser. Expect [**up to 70% smaller i18n bundle sizes**](https://inlang.com/m/gerre34r/library-inlang-paraglideJs/benchmark) compared to runtime i18n libraries (e.g. 47 KB vs 205 KB).

## Why Paraglide?

|                           |                                                                                                                                                                                                                |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Vite-Native**           | Designed for Vite and modern ESM bundlers. Works with TanStack Start, SvelteKit, React Router, Astro, Vue, Solid, and vanilla JS/TS.                                                                           |
| **Smaller i18n Bundle**   | Up to 70% smaller i18n bundle size than runtime i18n libraries.                                                                                                                                                |
| **Tree-Shakable**         | Messages compile to ESM functions, so unused translations are eliminated by your bundler.                                                                                                                       |
| **Fully Typesafe**        | Autocomplete for message keys and parameters. Typos become compile errors.                                                                                                                                     |
| **Built-in i18n Routing** | URL-based locale detection and localized paths out of the box.                                                                                                                                                 |
| **Open Localization Format** | Built on inlang: `project.inlang/settings.json` configures locales, plugins, and file patterns while translations stay in version-controlled files like `messages/en.json`. |

## Get Started With Your Framework

<p>
  <a href="https://inlang.com/m/gerre34r/library-inlang-paraglideJs/vite"><img src="https://cdn.simpleicons.org/react/61DAFB" alt="React" width="18" height="18" /> React</a> ·
  <a href="https://inlang.com/m/gerre34r/library-inlang-paraglideJs/vite"><img src="https://cdn.simpleicons.org/vuedotjs/4FC08D" alt="Vue" width="18" height="18" /> Vue</a> ·
  <a href="https://github.com/TanStack/router/tree/main/examples/react/start-i18n-paraglide"><img src="https://tanstack.com/images/logos/logo-color-100.png" alt="TanStack" width="18" height="18" /> TanStack Start</a> ·
  <a href="https://inlang.com/m/gerre34r/library-inlang-paraglideJs/sveltekit"><img src="https://cdn.simpleicons.org/svelte/FF3E00" alt="Svelte" width="18" height="18" /> SvelteKit</a> ·
  <a href="https://inlang.com/m/gerre34r/library-inlang-paraglideJs/react-router"><img src="https://cdn.simpleicons.org/reactrouter/CA4245" alt="React Router" width="18" height="18" /> React Router</a> ·
  <a href="https://inlang.com/m/gerre34r/library-inlang-paraglideJs/astro"><img src="https://cdn.simpleicons.org/astro/FF5D01" alt="Astro" width="18" height="18" /> Astro</a> ·
  <a href="https://inlang.com/m/gerre34r/library-inlang-paraglideJs/vanilla-js-ts"><img src="https://cdn.simpleicons.org/javascript/F7DF1E" alt="JavaScript" width="18" height="18" /> Vanilla JS/TS</a>
</p>

- **[TanStack Start example](https://github.com/TanStack/router/tree/main/examples/react/start-i18n-paraglide)** — SSR, localized routing, and TanStack Router integration.
- **[SvelteKit guide](https://inlang.com/m/gerre34r/library-inlang-paraglideJs/sveltekit)** — SvelteKit's official i18n integration.
- **[React Router guide](https://inlang.com/m/gerre34r/library-inlang-paraglideJs/react-router)** — SSR and client routing.
- **[Astro guide](https://inlang.com/m/gerre34r/library-inlang-paraglideJs/astro)** — static and server-rendered sites.
- **[Vite guide](https://inlang.com/m/gerre34r/library-inlang-paraglideJs/vite)** — React, Vue, Solid, or vanilla JS/TS.

> [!TIP]
> <img src="https://vitejs.dev/logo.svg" alt="Vite" width="16" height="16" /> **Paraglide is ideal for Vite-based apps.** Setup is one plugin, messages compile to ESM, and Vite's tree-shaking eliminates unused translations automatically. [Get started →](https://inlang.com/m/gerre34r/library-inlang-paraglideJs/vite)

## SSR Ready

Paraglide works in SSR apps with request-scoped locale handling. The server middleware detects the locale from each request and uses AsyncLocalStorage so `getLocale()` and message functions resolve the right locale even during concurrent requests.

```ts
import { paraglideMiddleware } from "./paraglide/server.js";
import { getLocale } from "./paraglide/runtime.js";
import { m } from "./paraglide/messages.js";

export function handle(request: Request) {
  return paraglideMiddleware(request, async () => {
    const html = `
      <html lang="${getLocale()}">
        <body>${m.greeting({ name: "Ada" })}</body>
      </html>
    `;

    return new Response(html, {
      headers: { "content-type": "text/html" },
    });
  });
}
```

**[SSR Docs →](https://inlang.com/m/gerre34r/library-inlang-paraglideJs/server-side-rendering)** · **[Middleware Docs →](https://inlang.com/m/gerre34r/library-inlang-paraglideJs/middleware)**

## Router Composition

Paraglide coexists with your router. Your app keeps canonical routes like `/about`, while Paraglide maps browser-facing localized URLs like `/en/about` or `/de/ueber` to those canonical routes.

Use your framework or router for route definitions, loaders, navigation, and route typing. Use Paraglide for locale detection, localized URL generation, and message functions.

```ts
import { deLocalizeUrl, localizeUrl } from "./paraglide/runtime.js";

// Incoming request: localized URL -> canonical app route
deLocalizeUrl("https://example.com/de/ueber").href; // https://example.com/about

// Outgoing link: canonical app route -> localized URL
localizeUrl("https://example.com/about", { locale: "de" }).href; // https://example.com/de/ueber
```

For routers with rewrite hooks, call `deLocalizeUrl()` on incoming URLs and `localizeUrl()` on outgoing URLs. For file-based routers, keep your file routes canonical and localize at the routing boundary.

**[i18n Routing Docs →](https://inlang.com/m/gerre34r/library-inlang-paraglideJs/i18n-routing)**

### TanStack Start

TanStack Start uses the same boundary pattern: TanStack Router owns the route tree, loaders, navigation, and typed links. Paraglide handles locale detection, localized URL mapping, and message functions.

```ts
import { paraglideMiddleware } from "./paraglide/server.js";
import handler from "@tanstack/react-start/server-entry";

export default {
  fetch(req: Request): Promise<Response> {
    return paraglideMiddleware(req, () => handler.fetch(req));
  },
};
```

Route code stays TanStack-native: TanStack Router owns route trees, loaders, server functions, navigation, and typed links. TanStack runs Paraglide in e2e tests on every router commit, and the guide covers router rewrites, localized links, prerendering, and SSR behavior.

**[TanStack Start i18n guide →](https://github.com/TanStack/router/tree/main/examples/react/start-i18n-paraglide)**

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

## Rich Text

For `<Trans>`-style rich text and component interpolation, use typed markup with your framework adapter.

```tsx
import { ParaglideMessage } from "@inlang/paraglide-js-react";
import { m } from "./paraglide/messages.js";

export function ContactCta() {
  return (
    <ParaglideMessage
      message={m.cta}
      markup={{
        link: ({ children }) => <a href="/contact">{children}</a>,
        strong: ({ children }) => <strong>{children}</strong>,
      }}
    />
  );
}
```

The markup names come from your message and are type-checked, so translators control where links and emphasis appear while your React app controls how they render.

**[Markup Docs →](https://inlang.com/m/gerre34r/library-inlang-paraglideJs/markup)** · **[React](https://www.npmjs.com/package/@inlang/paraglide-js-react)** · **[Svelte](https://www.npmjs.com/package/@inlang/paraglide-js-svelte)** · **[Vue](https://www.npmjs.com/package/@inlang/paraglide-js-vue)** · **[Solid](https://www.npmjs.com/package/@inlang/paraglide-js-solid)**

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

Paraglide supports locale-aware formatting via declaration formatters:

- `plural` (`Intl.PluralRules`) for plural and ordinal categories
- `number` (`Intl.NumberFormat`) for numbers, currency, compact notation, and more
- `datetime` (`Intl.DateTimeFormat`) for dates/times with locale-aware output

Gender and custom selects are supported via the variants system.

```js
// Pluralization example
m.items_in_cart({ count: 1 }); // "1 item in cart"
m.items_in_cart({ count: 5 }); // "5 items in cart"

// Works correctly for complex locales (Russian, Arabic, etc.)
```

Message format is **plugin-based** — use the default inlang format, or switch to i18next, JSON, or ICU MessageFormat via [plugins](https://inlang.com/c/plugins). If your team relies on ICU MessageFormat 1 syntax, use the [inlang-icu-messageformat-1 plugin](https://inlang.com/m/p7c8m1d2/plugin-inlang-icu-messageformat-1).

**[Formatting Docs →](https://inlang.com/m/gerre34r/library-inlang-paraglideJs/formatting)** · **[Pluralization & Variants Docs →](https://inlang.com/m/gerre34r/library-inlang-paraglideJs/variants)**

## Why Compiler-First?

Runtime i18n libraries like i18next resolve message keys from dictionaries while your app runs. Paraglide compiles messages into typed ESM functions before your app ships.

That means Vite can tree-shake unused translations, TypeScript can autocomplete message keys and parameters, and your components call plain functions instead of resolving strings through a runtime lookup layer.

In the [Paraglide benchmark](https://inlang.com/m/gerre34r/library-inlang-paraglideJs/benchmark), typical scenarios shipped **47-144 KB with Paraglide** vs **205-422 KB with i18next**. With 5 locales, 100 used messages, and 200 total messages, Paraglide shipped **47 KB** while i18next shipped **205 KB**.

Tree-shaking also keeps Paraglide stable as your message catalog grows. In the benchmark, using 100 messages shipped **47 KB** with Paraglide whether the project had 200, 500, or 1,000 total messages. The i18next runtime bundle grew from **205 KB** to **414 KB**.

## Comparison

| Feature                 | Paraglide                                                                        | Lingui                       | i18next              |
| ----------------------- | -------------------------------------------------------------------------------- | ---------------------------- | -------------------- |
| **Architecture**        | Compiler-first ESM message functions                                             | Extraction + compiled catalogs | Runtime dictionaries |
| **i18n bundle size**    | Up to 70% smaller via message-level tree-shaking                                  | Compiled catalogs            | Runtime dictionaries |
| **Tree-shakable**       | ✅ Message functions                                                              | Catalog-based                | ❌                   |
| **Typesafe**            | ✅ Generated message functions                                                    | Macro/component workflow     | Partial              |
| **Framework support**   | TanStack Start, SvelteKit, React Router, Astro, Vue, Solid, vanilla JS/TS         | React, Vue, Astro, Svelte, Node.js, vanilla JS | Broad via wrappers |
| **Routing + SSR**       | ✅ Middleware, request isolation, and URL helpers                                  | Use your framework/router    | Use your framework/router |
| **Rich text**           | ✅ Typed markup adapters                                                          | ✅ Rich-text components       | Via framework wrappers |
| **ICU MessageFormat 1** | ✅ [Via plugin](https://inlang.com/m/p7c8m1d2/plugin-inlang-icu-messageformat-1) | ✅                           | Via plugin           |

**[Full Comparison →](https://inlang.com/m/gerre34r/library-inlang-paraglideJs/comparison)**

## FAQ

### Does Paraglide support ICU MessageFormat?

Yes. Paraglide's message format is plugin-based. You can use the default inlang format, JSON, i18next, XLIFF, or ICU MessageFormat 1 via the [ICU plugin](https://inlang.com/m/p7c8m1d2/plugin-inlang-icu-messageformat-1).

### What about dynamic or CMS-driven keys?

Paraglide works best when message keys are known at build time, because that enables type safety and tree-shaking. For dynamic menus or CMS entries, use explicit mappings from CMS/content IDs to generated message functions, or let the CMS return already-localized content for the active locale. If most translations are only known at runtime, a runtime i18n library may be a better fit.

### Can I migrate from i18next?

Yes. Paraglide can compile existing i18next translation files through the [i18next plugin](https://inlang.com/m/3i8bor92/plugin-inlang-i18next), so you can keep your translation format while moving app code from `i18next.t("key")` to typed message functions over time.

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

Paraglide compiles messages from [inlang](https://github.com/opral/inlang), the open project file format for localization. In concrete terms, `project.inlang/settings.json` defines your locales, plugins, and translation file patterns; your translations stay as version-controlled files in your repo, such as `messages/en.json`, `locales/en.json`, or XLIFF files. Existing formats can be imported/exported through plugins. No account required; inlang tools are optional:

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
- [Formatting (Number/Date)](https://inlang.com/m/gerre34r/library-inlang-paraglideJs/formatting)
- [Routing & SSR](https://inlang.com/m/gerre34r/library-inlang-paraglideJs/server-side-rendering)
- [API Reference](https://inlang.com/m/gerre34r/library-inlang-paraglideJs)

## Contributing

We welcome contributions! See [CONTRIBUTING.md](https://github.com/opral/paraglide-js/blob/main/CONTRIBUTING.md) for guidelines.

- [GitHub Issues](https://github.com/opral/inlang-paraglide-js/issues)
- [Discord Community](https://discord.gg/gdMPPWy57R)

## License

MIT — see [LICENSE](https://github.com/opral/paraglide-js/blob/main/LICENSE)
