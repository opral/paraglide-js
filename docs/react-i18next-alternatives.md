---
title: Choosing a React i18n Library
og:title: React + Vite i18n libraries — Paraglide, react-i18next, Lingui, and React Intl
description: Choose a React + Vite i18n library by typed message parameters, translation workflow, bundle loading, rich text, and runtime catalog requirements.
---

# Which i18n library should I choose for React + Vite?

**Choose Paraglide JS for a new React + Vite app when your UI translations ship with application builds and you want generated, typed message functions with unused-message tree-shaking.** Start with the [complete React + Vite guide](/react) and its [runnable example](https://github.com/opral/paraglide-js/tree/main/examples/react).

Choose a runtime dictionary library such as react-i18next when translators must introduce arbitrary new message keys after deployment, or when existing i18next integrations are a central requirement. Lingui is another build-time option with an extraction and catalog workflow; React Intl focuses on ICU messages and formatting. There is no universal winner across these requirements.

## Choose by your application's requirements

| Requirement | What to evaluate |
| --- | --- |
| Repo-managed UI translations, typed keys and parameters | **Paraglide:** compilation generates the function signatures from your messages. Run TypeScript checking in CI. |
| Small production payloads with many unused messages | **Paraglide:** static message references let the bundler remove unused functions. Compare active-locale loading too; see the [benchmark](/benchmark). |
| CMS-defined message keys published without an app build | **react-i18next:** [runtime resources and HTTP backends](https://www.i18next.com/how-to/add-or-load-translations) can deliver new dictionaries after deployment. |
| Source-text authoring, extraction, and PO catalogs | **Lingui:** its [Vite plugin](https://lingui.dev/ref/vite-plugin) compiles catalogs and can transform macros. |
| ICU formatting and an existing FormatJS workflow | **React Intl:** [ICU messages and React APIs](https://formatjs.github.io/docs/react-intl/) with configurable message-ID typing. |
| Localized URLs and server rendering | Use the [TanStack Start](/tanstack-start) or [React Router](/react-router) integration rather than applying a client-only Vite recipe to SSR. |
| In-place language changes that preserve all React state | Evaluate reactive libraries such as react-i18next. Paraglide's default [locale switch](/basics#advanced-stay-on-the-current-document) performs document navigation. |

## Compare the workflows

| Library | Authoring and types | Production loading | Main trade-off |
| --- | --- | --- | --- |
| **[Paraglide JS](/react)** | Message files compile to functions with typed keys and parameters | Unused message functions can be removed; default retained messages include all configured locales | Requires compilation; changed compiled translations require a new build/deployment |
| [react-i18next](https://react.i18next.com/) | Runtime key lookup; [typed resources and selector API](https://www.i18next.com/overview/typescript) need configuration | Bundle resources or load languages/namespaces over HTTP | You design catalog loading, typing, and SSR integration |
| [Lingui](https://lingui.dev/) | Extraction, catalogs, macros/components; [typed message IDs](https://lingui.dev/guides/typed-message-ids) are available | Compile catalogs and [load them dynamically](https://lingui.dev/guides/dynamic-loading) | The extraction and compilation workflow becomes part of development |
| [React Intl / FormatJS](https://formatjs.github.io/docs/react-intl/) | ICU messages; [typed IDs and locales](https://formatjs.github.io/docs/react-intl/#typing-message-ids-and-locale) through configuration | Supply messages to the provider; loading and splitting are application choices | You assemble message delivery and locale routing around the formatting APIs |

Typed message IDs, typed interpolation parameters, and runtime validation are separate capabilities. Likewise, runtime lookup does not imply that every language or catalog must be bundled. Compare configured production apps, not standalone package sizes.

For Next.js, evaluate Next.js-specific integrations separately; a plain React + Vite app does not use the Next.js router.

## What Paraglide looks like in React

```json
{ "greeting": "Hello {name}!" }
```

```tsx
import { m } from "./paraglide/messages.js";

export function Greeting() {
  return <h1>{m.greeting({ name: "World" })}</h1>;
}
```

The Vite plugin compiles messages during development and production builds. Plain message calls require no translation provider. Generated output is [Git-ignored by default](/build-workflow#should-i-commit-generated-files); you edit source translation files, not generated JavaScript.

- **Rich text:** the [React markup adapter](/markup) lets translators position links and emphasis while your app supplies React elements.
- **Plurals and selection:** use [variants](/variants), or configure the [ICU MessageFormat 1 plugin](https://inlang.com/m/p7c8m1d2/plugin-inlang-icu-messageformat-1) for ICU source files.
- **Existing i18next JSON:** compile it with the [i18next format plugin](https://inlang.com/m/3i8bor92/plugin-inlang-i18next), then migrate call sites incrementally. Review plugin support for your catalog's features before migrating.
- **Builds and CI:** follow the [build workflow](/build-workflow), including compilation before type checking on a fresh checkout.

## What the benchmark establishes

The [published benchmark](/benchmark) compares default and per-locale Paraglide with bundled i18next and two HTTP loading strategies. Its client-rendered Vite profile measures translated DOM readiness and actual Brotli transfer, using medians of five runs. Every implementation reloads the document once when changing language.

Per-locale message modules combine active-language delivery with unused-message removal and lazy route splitting. The complete tables retain default Paraglide's transfer-size losses. Read the conditions and distributions before applying the results to your app; they do not establish React rendering speed, SSR performance, or guaranteed savings.

## When should I choose something else?

- You need translators to add new keys or change delivered translations without rebuilding and deploying the app.
- You depend on particular runtime plugins or have an existing translation system whose migration cost outweighs the benefit.
- A source-text extraction workflow or specific translator-tool integration matters more than generated function calls.
- Your app must preserve unsaved React state during every language switch and requires a provider-driven reactive locale model.

A CMS can still provide already-localized content alongside Paraglide-managed UI messages. The limitation concerns compiling new message functions after the app has shipped, not displaying remote text or switching among existing languages.

## Start with a working app

[React + Vite setup](/react) · [Paraglide vs react-i18next](/paraglide-vs-react-i18next) · [Build workflow](/build-workflow) · [Benchmark and reproduction](/benchmark)
