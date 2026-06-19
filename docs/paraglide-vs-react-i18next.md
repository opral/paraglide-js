---
title: Paraglide JS vs react-i18next
og:title: Paraglide JS vs react-i18next (2026) — compiler vs runtime i18n
description: A side-by-side comparison of Paraglide JS and react-i18next for React + Vite apps — bundle size, type safety, locale switching, rich text, and how to migrate without rewriting your translation files.
---

# Paraglide JS vs react-i18next

**Paraglide JS is a compiler-first alternative to react-i18next: up to [70% smaller i18n bundles](/benchmark), type safety with zero setup, and a native fit for React + Vite — and you can migrate without rewriting your translation files.**

```bash
npx @inlang/paraglide-js init
```

[Try the React + Vite example →](https://github.com/opral/paraglide-js/tree/main/examples/react) · [See the benchmark →](/benchmark)

[react-i18next](https://react.i18next.com/) is the de-facto standard for React i18n, with millions of weekly downloads and a deep ecosystem. The difference is architectural: react-i18next resolves keys from a dictionary **at runtime**, while Paraglide **compiles** your messages into tree-shakable, typed functions **at build time**. This page compares them honestly so you can pick the right one.

## TL;DR

- **Choose Paraglide** if you want the smallest possible i18n bundle, end-to-end type safety with zero setup, and a first-class fit for Vite/ESM build tools. Ideal for greenfield React + Vite apps.
- **Choose react-i18next** if you depend on a large existing i18next codebase, need translations that are only known at runtime (e.g. CMS-driven keys), or rely on specific i18next plugins and its mature ecosystem.
- **You don't have to rewrite to try Paraglide.** It can compile your existing i18next JSON files via the [i18next plugin](https://inlang.com/m/3i8bor92/plugin-inlang-i18next) — an integration **officially supported by the i18next team** — so you can migrate incrementally.

## At a glance

| | Paraglide JS | react-i18next |
| --- | --- | --- |
| **Architecture** | 🏗️ Compiler (build-time) | 🏃 Runtime dictionary |
| **i18n bundle size** | [Up to 70% smaller](/benchmark) via per-message tree-shaking | Ships the i18next runtime + your catalogs |
| **Bundle growth** | Flat — only *used* messages ship | Grows with catalog size |
| **Type safety** | ✅ Generated typed functions (keys **and** params) | 🟠 Via TypeScript [workarounds](https://www.i18next.com/overview/typescript) |
| **Setup** | One Vite plugin, no provider/context | `I18nextProvider` + init + hooks |
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

In the [Paraglide benchmark](/benchmark) (5 locales, 100 used messages, 200 total), Paraglide shipped **47 KB** vs **205 KB** for i18next. Because only *used* messages ship, Paraglide's bundle stays flat as the catalog grows — 47 KB whether the project has 200, 500, or 1,000 total messages — while the runtime bundle grows from **205 KB to 414 KB**.

If bundle size on a client-rendered React + Vite app is a priority, this is the single biggest difference.

## Type safety

Paraglide generates the message functions, so keys and parameters are typed by default — a renamed or missing message is a **compile error**, and your editor autocompletes both names and arguments. react-i18next can approximate this with [TypeScript augmentation](https://www.i18next.com/overview/typescript), but it's opt-in setup you maintain rather than something you get for free.

## Locale switching in React

react-i18next re-renders subscribed components via `useTranslation()` when you call `i18n.changeLanguage()`.

Paraglide's `setLocale()` **reloads the page by default** so every message re-renders in the new locale — no provider or context to wire up. This is a deliberate design choice: a user switches language once, so a reload keeps the implementation simple and avoids framework-specific logic for preserving form state, scroll position, and the like (the same approach YouTube and other large sites take). If you'd rather drive re-rendering yourself, pass `setLocale("de", { reload: false })`. See [the basics](https://paraglidejs.com/basics).

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

You don't have to rewrite your translations. Paraglide can compile your existing i18next JSON files through the official [i18next plugin](https://inlang.com/m/3i8bor92/plugin-inlang-i18next). That means you can:

1. Keep your current `en.json` / `de.json` files and folder structure.
2. Point Paraglide at them and start importing typed `m.*` functions.
3. Replace `t("key")` call sites with `m.key()` incrementally — no big-bang rewrite.

## When react-i18next is still the better choice

To be fair: react-i18next remains an excellent, battle-tested choice. Prefer it when:

- **Most keys are only known at runtime** (CMS-driven menus, user-generated content). Compiler tree-shaking and type safety rely on keys being known at build time.
- **You have a large existing i18next codebase** and team familiarity, and the migration cost outweighs the gains.
- **You depend on specific i18next plugins** or its broader ecosystem.

## Try Paraglide

```bash
npx @inlang/paraglide-js init
```

- [Full React + Vite example](https://github.com/opral/paraglide-js/tree/main/examples/react)
- [React Router (SSR) guide](https://paraglidejs.com/react-router)
- [Benchmark](/benchmark) · [Full comparison](/comparison)
