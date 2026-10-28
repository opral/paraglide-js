---
title: Comparison
og:title: Paraglide JS, i18next, and React Intl — architecture and loading trade-offs
description: Compare generated message functions, typed parameters, catalog loading, locale switching, and SSR integration in Paraglide JS, i18next, and React Intl.
---

# Compare Paraglide JS, i18next, and React Intl

Paraglide compiles source translations into typed JavaScript functions. i18next and React Intl resolve messages through runtime APIs, with catalog delivery configured by your app. Choose based on your translation workflow, loading strategy, and framework integration.

For a new React app, start with [choosing a React + Vite i18n library](/react-i18next-alternatives). For a focused migration comparison, read [Paraglide vs react-i18next](/paraglide-vs-react-i18next). The [benchmark](/benchmark) measures configured applications, including both bundled and HTTP-loaded i18next.

## Messages, types, and production loading

| Capability | Paraglide JS | i18next | React Intl / FormatJS |
| --- | --- | --- | --- |
| Message access | Generated function calls | Runtime dictionary lookup | Runtime formatting APIs and React components |
| Unused-message removal | Static references let the bundler remove unused message functions | Catalog size depends on resource and namespace loading | Catalog size depends on supplied messages and application splitting |
| Default locale delivery | Retained messages include configured locales | [Bundle or load languages/namespaces](https://www.i18next.com/how-to/add-or-load-translations) | Application supplies messages for the active locale |
| Typed message IDs | Generated from source messages | [Typed resources and selector API](https://www.i18next.com/overview/typescript) | [Configurable typed IDs](https://formatjs.github.io/docs/react-intl/#typing-message-ids-and-locale) |
| Typed interpolation parameters | Generated message signatures | Inference depends on resource declarations and configuration | Check the [typed-message APIs](https://formatjs.github.io/docs/react-intl/) for your version and resource setup |
| Plurals and selection | [Variants](/variants), including plural categories | [Plurals](https://www.i18next.com/translation-function/plurals) and context | [ICU MessageFormat](https://formatjs.github.io/docs/core-concepts/icu-syntax) |
| Rich text in React | [Typed markup adapter](/markup) | [Trans component](https://react.i18next.com/latest/trans-component) | [Rich-text formatting](https://formatjs.github.io/docs/react-intl/components/#rich-text-formatting) |
| Translation changes after deployment | Compiled message changes require build/deployment | Runtime resources can be updated independently | App can supply updated messages at runtime |

Typed IDs, generated parameter contracts, and runtime validation are different guarantees. All depend on your application's checking and delivery setup. Runtime lookup does not require bundling all languages or every catalog entry.

## Routing and framework integration

Paraglide provides [locale detection strategies](/strategy), [localized URL helpers](/i18n-routing), and [middleware](/middleware) for request-scoped SSR. Follow the maintained [TanStack Start](/tanstack-start), [SvelteKit](/sveltekit), or [React Router](/react-router) integration for your framework. Plain message functions also work outside React.

i18next has framework bindings and [server middleware](https://github.com/i18next/i18next-http-middleware); React Intl supplies React formatting APIs. Compose locale routing and request isolation with your framework rather than sharing mutable locale state across concurrent SSR requests. See each integration's SSR instructions.

Paraglide's standard locale switch performs document navigation. react-i18next can update a running React tree through `changeLanguage()`, while React Intl receives locale and messages through its provider. If preserving in-memory UI state across language changes is essential, include that requirement in your evaluation.

## Tree-shaking and active-locale loading

Unused-message tree-shaking removes message functions your application does not reference. Active-locale loading avoids delivering translations for other languages. One does not prove the other.

Default Paraglide output includes configured locales for each retained message. [Experimental locale splitting](/compiling-messages) has additional deployment and framework constraints. There is no universal threshold such as “20 locales” at which a loading strategy becomes better: message usage, compression, caching, and route splitting all matter.

The [benchmark](/benchmark) shows cases where HTTP i18next transfers fewer bytes while Paraglide reaches translated DOM readiness sooner. Read the conditions and measured losses as well as the wins. These client-rendered Vite measurements do not establish SSR, React rendering, or cross-device performance.

To verify unused-message removal yourself, run the [tree-shaking probe](/build-workflow#does-tree-shaking-remove-unused-messages). Generated files are [Git-ignored by default](/build-workflow#should-i-commit-generated-files); compilation is part of dev/build rather than a required generated-file commit before each push.

## Try a representative production build

Use your actual catalogs, routes, locale count, rich text, and deployment target. Check translated content, language switching, generated types, initial transfer, and subsequent navigation before selecting a library.

[React + Vite guide](/react) · [Build workflow and CI](/build-workflow) · [Benchmark and reproduction](/benchmark)
