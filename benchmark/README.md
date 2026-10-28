---
description: Compare Paraglide JS and i18next with real translations, Vite 8, Brotli transfer, and validated browser journeys. Explore translated DOM readiness and download size.
---

# Paraglide JS vs i18next benchmark

How quickly does a translated page become ready? This benchmark compares **translated DOM readiness** for the same client-rendered application using Paraglide JS, bundled i18next, and i18next with an HTTP backend. It also measures actual Brotli transfer size, navigation, and language switching.

## Main findings

- **Paraglide reaches translated DOM readiness sooner in 45/45 comparisons** in this test profile, based on medians of five runs.
- **Transfer size has tradeoffs.** Paraglide beats bundled i18next in every tested scenario, but transfers more bytes in 6/45 initial-load or full-journey comparisons against the other implementations. HTTP i18next can be smaller when many locales and messages are configured.
- **Tree-shaking limits the cost of unused messages.** Paraglide's payload stays approximately constant as unused catalog entries grow. Its default setup still includes the used messages for every configured locale; HTTP backends can fetch only the active language.

These are results for one application, host, and network profile. They are not a guarantee for every website. The complete results, including Paraglide's size losses, appear below.

## Interactive examples

Explore locale counts, message counts, readiness, and transfer size. Complete results for every scenario are listed below.

<div data-benchmark-explorer=""></div>

## Translated DOM readiness

The primary metric is the time from navigation start until translated text has been inserted into the DOM. It includes resource loading, library initialization, translation, and DOM updates. **It does not measure first paint, LCP, INP, or general interaction readiness.** Lower is better.

| Locales | Used messages | Catalog messages | Paraglide JS | i18next bundled | i18next HTTP catalog | i18next HTTP routes |
| --- | --- | --- | --- | --- | --- | --- |
| 2 | 50 | 200 | 174 ms | 198 ms | 259 ms | 257 ms |
| 5 | 50 | 200 | 179 ms | 207 ms | 264 ms | 258 ms |
| 10 | 50 | 200 | 187 ms | 228 ms | 260 ms | 260 ms |
| 2 | 50 | 1000 | 174 ms | 219 ms | 278 ms | 259 ms |
| 5 | 50 | 1000 | 178 ms | 267 ms | 285 ms | 267 ms |
| 10 | 50 | 1000 | 186 ms | 346 ms | 283 ms | 262 ms |
| 2 | 200 | 1000 | 182 ms | 228 ms | 286 ms | 268 ms |
| 5 | 200 | 1000 | 195 ms | 274 ms | 286 ms | 268 ms |
| 10 | 200 | 1000 | 217 ms | 352 ms | 286 ms | 267 ms |
| 2 | 50 | 4000 | 175 ms | 302 ms | 305 ms | 271 ms |
| 5 | 50 | 4000 | 177 ms | 483 ms | 306 ms | 274 ms |
| 10 | 50 | 4000 | 184 ms | 795 ms | 307 ms | 272 ms |
| 2 | 200 | 4000 | 181 ms | 310 ms | 312 ms | 280 ms |
| 5 | 200 | 4000 | 194 ms | 491 ms | 319 ms | 284 ms |
| 10 | 200 | 4000 | 220 ms | 799 ms | 315 ms | 279 ms |

Ranges across all five repetitions and per-step timings are available in the explorer and the downloadable data. The measurements do not establish statistical performance across other machines or network conditions.

## Initial transfer size

These are real Brotli responses, including response headers, measured by Chromium. KiB means 1,024 bytes. Lower is better. This is a companion metric, not a substitute for translated DOM readiness.

| Locales | Used messages | Catalog messages | Paraglide JS | i18next bundled | i18next HTTP catalog | i18next HTTP routes |
| --- | --- | --- | --- | --- | --- | --- |
| 2 | 50 | 200 | 8.5 KiB | 25.0 KiB | 23.1 KiB | 21.2 KiB |
| 5 | 50 | 200 | 13.0 KiB | 37.1 KiB | 23.1 KiB | 21.2 KiB |
| 10 | 50 | 200 | 22.1 KiB | 58.4 KiB | 23.2 KiB | 21.2 KiB |
| 2 | 50 | 1000 | 8.5 KiB | 49.2 KiB | 34.9 KiB | 24.8 KiB |
| 5 | 50 | 1000 | 13.0 KiB | 97.0 KiB | 34.9 KiB | 24.8 KiB |
| 10 | 50 | 1000 | 22.1 KiB | 178.9 KiB | 35.0 KiB | 24.8 KiB |
| 2 | 200 | 1000 | 16.5 KiB | 50.1 KiB | 35.9 KiB | 25.7 KiB |
| 5 | 200 | 1000 | 31.4 KiB | 97.9 KiB | 35.9 KiB | 25.7 KiB |
| 10 | 200 | 1000 | 60.0 KiB | 179.9 KiB | 35.9 KiB | 25.7 KiB |
| 2 | 50 | 4000 | 8.5 KiB | 130.2 KiB | 74.3 KiB | 34.0 KiB |
| 5 | 50 | 4000 | 13.0 KiB | 289.3 KiB | 74.3 KiB | 34.1 KiB |
| 10 | 50 | 4000 | 22.1 KiB | 569.0 KiB | 74.3 KiB | 34.1 KiB |
| 2 | 200 | 4000 | 16.5 KiB | 131.2 KiB | 75.2 KiB | 35.0 KiB |
| 5 | 200 | 4000 | 31.4 KiB | 290.2 KiB | 75.2 KiB | 35.0 KiB |
| 10 | 200 | 4000 | 60.0 KiB | 570.0 KiB | 75.3 KiB | 35.0 KiB |

For example, with ten locales, 200 used messages, and a 1,000-message catalog, Paraglide transfers about 60 KiB versus about 26 KiB for route-based HTTP i18next, while reaching translated DOM readiness in about 217 ms versus about 267 ms in this run. The default Paraglide configuration ships used messages for all locales. Locale-specific delivery is the next optimization to evaluate.

## Methodology

### Same working application

All four implementations render the same text, interpolation values, five lazy-loaded routes, language controls, plural output, and locale-sensitive dates. The corpus contains distinct translations from Cal.diy's public translation files, with source hashes, source-key mappings, and the upstream MIT license retained in the benchmark source. Naturally identical labels remain; the fixture does not replace translations with copies of English.

The matrix covers 2, 5, and 10 locales; catalogs of 200, 1,000, and 4,000 messages; and 50 or 200 used messages per route. Combinations that cannot supply five routes' messages are excluded before measurement. Twenty messages are shared across routes. Route namespaces partition the remaining catalog evenly; this is a controlled fixture, not a reconstruction of Cal.diy's application routes.

The selection uses a fixed hash seed independent of results. It aims for 20% interpolated messages until eligible source strings are exhausted. Rich markup, nested translation calls, contextual/plural source keys, and incompatible placeholder sets are excluded from this text-only corpus. Supplemental plural messages test counts 0, 1, 2, 3, 11, and 100. Every implementation uses the same native Intl date-formatting code.

### Implementations

| Implementation | Translation loading |
| --- | --- |
| Paraglide JS | Standard message modules, static message references, automatic removal of unused messages; used messages include all configured locales |
| i18next bundled | Compact resource objects containing all locales and namespaces, bundled with the app |
| i18next HTTP catalog | Official HTTP backend; one complete catalog for the active language |
| i18next HTTP routes | Official HTTP backend; the active language's common and route namespaces |

HTTP variants disable missing fallback languages and retain normal i18next resource caching. Changing language loads namespaces already used by the application. Finer namespaces can reduce unused data further; the results do not represent every possible configuration.

### Correctness before performance

All 60 builds pass checks across every configured locale and all five routes: **187,000 rendered strings and 10,200 plural outputs**. The tests independently compare rendered strings to the source catalog and verify interpolation, plural categories, dates, route state, and locale state. Page errors, console errors, failed requests, incorrect translations, and missing compression abort measurement.

### Browser journey and conditions

Each of 300 measured journeys starts with an empty browser-context cache: English route 0 → English route 1 → switch to the last configured locale → revisit route 0 → switch back to English. Caches remain active within the journey. Separate correctness checks do not warm the measured browser contexts.

Trials run sequentially, with order rotated between rounds. Conditions are 40 ms emulated network latency, 10 Mbps download, 5 Mbps upload, and 4× CPU throttling. The server sends Brotli at quality 5. Vite's production module preloading and default minifier remain enabled for every implementation. Timing means translated DOM readiness, not a translation-function microbenchmark.

This cohort covers client rendering. It does not establish results for SSR, hydration, server-only translations, experimental locale splitting, rich text, missing translations, or runtime-defined message keys.

### Versions and data

Measured October 28, 2026. Paraglide JS **2.29.3**, i18next **26.5.11**, HTTP backend **4.0.6**, Vite **8.3.5**, Playwright **1.50.1**. Host: macOS arm64, Node v22.17.0, Chromium 133.0.6943.16. Dependencies are pinned in the lockfile.

- [Download the summary CSV](/benchmark-data/summary.csv)
- [Download all browser measurements](/benchmark-data/results.json)
- [Download summary distributions and comparisons](/benchmark-data/summary.json)
- [Benchmark source and reproduction instructions](https://github.com/opral/paraglide-js/tree/main/benchmark)

## Reproduce and contribute

From the repository root, install dependencies with `pnpm install --frozen-lockfile`. Then run:

```sh
pnpm --filter @inlang/paraglide-js-benchmark exec playwright install --only-shell chromium
pnpm --filter @inlang/paraglide-js-benchmark bench
```

The benchmark builds the matrix, checks every locale and route, runs five browser repetitions, and generates the published result files and this page. Builds use the pinned published compiler so the published measurements can be reproduced. Test an optimization as a separately identified variant and retain the baseline and any losses.

Use `pnpm --filter @inlang/paraglide-js-benchmark publish-results --saved` to regenerate the page and explorer from the committed measurements without rerunning browser trials. Human and machine readers receive the same results; filtering does not remove the complete static tables.
