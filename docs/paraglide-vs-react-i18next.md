---
title: Paraglide JS vs react-i18next
og:title: Paraglide JS vs react-i18next (2026) — compiler vs runtime i18n
description: A side-by-side comparison of Paraglide JS and react-i18next for React + Vite apps — bundle size, type safety, locale switching, rich text, and how to migrate without rewriting your translation files.
---

# Paraglide JS vs react-i18next

**Paraglide JS is a compiler-first alternative to react-i18next for React + Vite: generated message functions with typed keys and parameters, and unused-message tree-shaking. Existing i18next JSON can be compiled through a format plugin while you migrate call sites.**

```bash
npx @inlang/paraglide-js init
```

[Try the React + Vite guide →](https://paraglidejs.com/react) · [See the benchmark →](/benchmark)

[react-i18next](https://react.i18next.com/) is the de-facto standard for React i18n, with millions of weekly downloads and a deep ecosystem. The difference is architectural: react-i18next resolves keys from a dictionary **at runtime**, while Paraglide **compiles** your messages into tree-shakable, typed functions **at build time**. This page compares them honestly so you can pick the right one.

## TL;DR

- **Choose Paraglide** when your translations ship with app builds and you want generated parameter types and unused-message removal in a Vite/ESM app.
- **Choose react-i18next** if you depend on a large existing i18next codebase, need translations that are only known at runtime (e.g. CMS-driven keys), or rely on specific i18next plugins and its mature ecosystem.
- **You don't have to rewrite to try Paraglide.** It can compile your existing i18next JSON files via the [i18next plugin](https://inlang.com/m/3i8bor92/plugin-inlang-i18next) — an integration **officially supported by the i18next team** — so you can migrate incrementally.

## At a glance

| | Paraglide JS | react-i18next |
| --- | --- | --- |
| **Architecture** | 🏗️ Compiler (build-time) | 🏃 Runtime dictionary |
| **Production loading** | Unused message functions removed; retained messages include configured locales by default | Runtime plus configured resources; languages/namespaces can be loaded on demand |
| **Unused catalog entries** | Static references let the bundler remove unused functions | Cost depends on catalog bundling, namespace boundaries, and loading |
| **Type safety** | ✅ Generated typed functions (keys **and** params) | ✅ [Typed resources and selector API](https://www.i18next.com/overview/typescript), requires configuration |
| **Setup** | One Vite plugin, no provider/context | Initialize i18next + React integration; [provider for multiple instances/SSR](https://react.i18next.com/latest/i18nextprovider) |
| **Calling a message** | `m.greeting({ name })` (plain function) | `t("greeting", { name })` via `useTranslation()` |
| **Rich text / `<Trans>`** | ✅ Typed [markup adapter](https://paraglidejs.com/markup) | ✅ `<Trans>` component |
| **Pluralization / ICU** | ✅ `Intl.PluralRules` + [variants](https://paraglidejs.com/variants); [ICU plugin](https://inlang.com/m/p7c8m1d2/plugin-inlang-icu-messageformat-1) | ✅ Mature |
| **Runtime / CMS-driven keys** | 🟠 Best when keys are known at build time | ✅ Strong |
| **Ecosystem maturity** | Newer, growing | ✅ Very mature, huge community |
| **Frameworks** | React, Vite, TanStack Start, SvelteKit, React Router, Astro, Vue, Solid, vanilla | React (with wrappers for other frameworks) |

## Architecture: compiler vs runtime

react-i18next loads your translation catalogs into memory and resolves keys through a `t()` lookup while your app runs. Paraglide compiles each message into its own typed ESM function ahead of time:

```js
// messages/en.json
{ "greeting": "Hello {name}!" }
```

```ts
// Paraglide — a real, imported function
import { m } from "./paraglide/messages.js";
m.greeting({ name: "World" }); // "Hello World!" — fully typesafe
```

```ts
// react-i18next — a runtime key lookup
const { t } = useTranslation();
t("greeting", { name: "World" });
```

Because messages are plain functions, your bundler **tree-shakes the ones you don't import**, and TypeScript checks both the key and its parameters.

## Bundle size

The [current benchmark](/benchmark) compares default Paraglide, per-locale message modules before and after compiler inlining, bundled i18next, and two HTTP configurations. It measures translated DOM readiness and actual Brotli transfer for the same client-rendered Vite app, using five-trial medians. Every implementation reloads the document once when changing language.

Per-locale message modules reduce active-language delivery and keep lazy routes' private messages out of the initial download. The benchmark retains default Paraglide's byte losses alongside the per-locale results. Read the complete tables and conditions; these are application-level measurements rather than standalone library sizes, React rendering timings, or universal performance claims.

Paraglide's default retained messages include all configured locales. i18next can [load only selected languages and namespaces](https://www.i18next.com/how-to/add-or-load-translations). Removing unused messages and delivering only the active language are separate optimizations. The [build workflow](/build-workflow#does-tree-shaking-remove-unused-messages) includes an unused-message probe and explains default Git-ignore behavior.

## Type safety

Paraglide generates the message functions, so keys and parameters are typed by default — a renamed or missing message is a **compile error**, and your editor autocompletes both names and arguments. i18next also supports typed keys and a selector API through [TypeScript configuration](https://www.i18next.com/overview/typescript). Interpolation inference depends on how resources and types are declared. Paraglide derives message signatures from compilation, while i18next requires configuring resource types. Both approaches need TypeScript checking in your workflow.

## Locale switching in React

react-i18next changes the language in the running React tree when you call `i18n.changeLanguage()`.

Paraglide treats a locale change as a **full document navigation**. By default, `setLocale()` updates the configured locale strategies, then navigates to the localized URL when URL routing is enabled or reloads the current document otherwise. The new document renders the app and any document-level locale settings together, without an i18n provider or reactive locale state in React.

The rare browser-only `reload: false` escape hatch is for a fully client-rendered, non-URL surface that must preserve non-restorable in-memory work; it makes React reactivity and document-state synchronization the application's responsibility. See [the warning in Basics](https://paraglidejs.com/basics#advanced-stay-on-the-current-document).

## Rich text (the `<Trans>` use case)

Both libraries let translators control where links and emphasis go inside a sentence while your app controls how they render. react-i18next uses `<Trans>`; Paraglide uses a typed [markup adapter](https://paraglidejs.com/markup):

```tsx
import { ParaglideMessage } from "@inlang/paraglide-js-react";
import { m } from "./paraglide/messages.js";

<ParaglideMessage
  message={m.cta}
  markup={{
    link: ({ children }) => <a href="/contact">{children}</a>,
    strong: ({ children }) => <strong>{children}</strong>,
  }}
/>;
```

The markup names come from your message and are type-checked. Adapters exist for [React](https://www.npmjs.com/package/@inlang/paraglide-js-react), [Svelte](https://www.npmjs.com/package/@inlang/paraglide-js-svelte), [Vue](https://www.npmjs.com/package/@inlang/paraglide-js-vue), and [Solid](https://www.npmjs.com/package/@inlang/paraglide-js-solid).

## Pluralization & ICU

Paraglide supports plurals and ordinals via `Intl.PluralRules`, plus gender/select through its [variants](https://paraglidejs.com/variants) system. If your team prefers the familiar **ICU MessageFormat** syntax, use the [ICU plugin](https://inlang.com/m/p7c8m1d2/plugin-inlang-icu-messageformat-1):

```
{count, plural, one {# item} other {# items}}
```

## Migrating from react-i18next

> [!NOTE]
> **The i18next team officially supports the inlang/Paraglide integration.** It was built together with the i18next maintainers — see the [joint announcement](https://inlang.com/blog/official-i18next-inlang-init).

Paraglide can compile existing i18next JSON files through the official [i18next plugin](https://inlang.com/m/3i8bor92/plugin-inlang-i18next). That means you can:

1. Check that the format plugin supports your catalog features and configure its path patterns for your `en.json` / `de.json` files.
2. Point Paraglide at them and start importing typed `m.*` functions.
3. Replace `t("key")` call sites with `m.key()` incrementally — no big-bang rewrite.

## When react-i18next is still the better choice

To be fair: react-i18next remains an excellent, battle-tested choice. Prefer it when:

- **Translations or new keys must be published without rebuilding** (for example, CMS-managed catalogs). Compiled translation edits require a build and deployment; switching among already-built languages works at runtime.
- **You have a large existing i18next codebase** and team familiarity, and the migration cost outweighs the gains.
- **You depend on specific i18next plugins** or its broader ecosystem.

## Try Paraglide

```bash
npx @inlang/paraglide-js init
```

- [React + Vite setup guide](https://paraglidejs.com/react)
- [React Router (SSR) guide](https://paraglidejs.com/react-router)
- [Benchmark](/benchmark) · [Full comparison](/comparison)
