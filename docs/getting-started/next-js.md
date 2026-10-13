---
title: Next.js
description: Add i18n to Next.js with Paraglide JS - App Router, server components, SSR, SSG, and type-safe translations.
imports:
  - https://cdn.jsdelivr.net/npm/@opral/markdown-wc/dist/markdown-wc-embed.js
---

<img src="https://cdn.jsdelivr.net/gh/opral/paraglide-js@latest/docs/getting-started/next-js-banner.png" alt="i18n library for next js" width="10000000px" />

Paraglide JS works with the Next.js App Router. The examples below use Next.js **16.4.0** and Paraglide JS **2.27.0**.

Choose the setup that matches your application:

| Setup | Public URLs               | Rendering                                                                                                             |
| ----- | ------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| SSR   | `/`, `/de`, `/de/subpage` | Prerendered locale shells with request-time content inside Suspense; Cache Components and Partial Prefetching enabled |
| SSG   | `/en`, `/de`              | Localized pages generated at build time; no proxy required                                                            |

Both setups use a `[locale]` root layout, await route parameters, and pass the locale explicitly to message functions and client components. This keeps server rendering, hydration, and client locale navigation consistent. The Webpack plugin requires `--webpack` for development and builds.

<markdown-wc-embed src="https://cdn.jsdelivr.net/gh/opral/paraglide-js@latest/examples/next-js-ssr/README.md"></markdown-wc-embed>

<markdown-wc-embed src="https://cdn.jsdelivr.net/gh/opral/paraglide-js@latest/examples/next-js-ssg/README.md"></markdown-wc-embed>

## Usage

Continue passing the resolved route locale with `m.example_message(inputs, { locale })` when translating on the server or in client components rendered by the server. See the [basics documentation](/basics) for message parameters and locale management.
