---
description: Compare default and per-locale Paraglide JS with bundled and HTTP i18next using Vite 8, real translations, Brotli transfer, and validated browser journeys.
---

# Paraglide JS vs i18next benchmark

How quickly does a translated page become ready? This benchmark compares **translated DOM readiness** and actual Brotli transfer for the same client-rendered application. It includes default Paraglide, per-locale message modules before and after a compiler optimization, bundled i18next, and two HTTP-backend configurations.

## Main findings

- **Optimized per-locale Paraglide reaches translated DOM readiness sooner in 45/45 comparisons** against the three i18next configurations, using medians of five runs.
- **Optimized per-locale transfer is smaller in 45/45 initial-load and 45/45 full-journey comparisons.** All results, including losses, remain visible below.
- **Per-locale message modules preserve locale, route, and message pruning.** The build selects one locale, static references remove unused messages, and lazy pages keep their private messages out of the initial download. Vite groups source modules into page/shared chunks; it does not request each message separately.
- **Inlining reduces generated code further.** With ten locales, 200 messages used per route, and a 1,000-message catalog, it reduces initial transfer from 11.8 KiB to 11.0 KiB (6.8%). Small timing differences between the released and optimized compiler do not establish an additional latency benefit.

These results cover one application, host, and network profile. They do not establish universal rankings or statistical significance. Default multilingual Paraglide remains visible: it has 6/45 comparisons where initial or journey transfer exceeds an i18next configuration.

## Interactive examples

Explore locale counts, message counts, readiness, and transfer size. Complete static tables for every scenario follow the explorer and are available without JavaScript.

<div data-benchmark-explorer=""></div>

## Translated DOM readiness

The primary metric is navigation start until translated text is inserted into the DOM. It includes resource loading, initialization, translation, and DOM updates. **It does not measure first paint, LCP, INP, or general interaction readiness.** Lower is better.

| Locales | Used / route | Catalog | Paraglide JS | Per locale · released | Per locale · optimized | i18next bundled | i18next HTTP catalog | i18next HTTP routes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2 | 50 | 200 | 173 ms | 171 ms | 172 ms | 196 ms | 210 ms | 209 ms |
| 5 | 50 | 200 | 178 ms | 172 ms | 171 ms | 208 ms | 210 ms | 206 ms |
| 10 | 50 | 200 | 183 ms | 170 ms | 170 ms | 226 ms | 209 ms | 209 ms |
| 2 | 50 | 1000 | 173 ms | 172 ms | 173 ms | 219 ms | 226 ms | 213 ms |
| 5 | 50 | 1000 | 174 ms | 170 ms | 171 ms | 266 ms | 234 ms | 213 ms |
| 10 | 50 | 1000 | 183 ms | 171 ms | 171 ms | 348 ms | 230 ms | 211 ms |
| 2 | 200 | 1000 | 182 ms | 177 ms | 176 ms | 228 ms | 236 ms | 220 ms |
| 5 | 200 | 1000 | 195 ms | 176 ms | 177 ms | 274 ms | 235 ms | 219 ms |
| 10 | 200 | 1000 | 218 ms | 177 ms | 178 ms | 351 ms | 235 ms | 221 ms |
| 2 | 50 | 4000 | 172 ms | 172 ms | 171 ms | 300 ms | 261 ms | 224 ms |
| 5 | 50 | 4000 | 178 ms | 173 ms | 171 ms | 484 ms | 257 ms | 225 ms |
| 10 | 50 | 4000 | 184 ms | 172 ms | 171 ms | 790 ms | 256 ms | 224 ms |
| 2 | 200 | 4000 | 181 ms | 176 ms | 177 ms | 309 ms | 265 ms | 230 ms |
| 5 | 200 | 4000 | 195 ms | 180 ms | 177 ms | 490 ms | 264 ms | 232 ms |
| 10 | 200 | 4000 | 217 ms | 175 ms | 176 ms | 798 ms | 263 ms | 231 ms |

The explorer and downloadable JSON retain minimum, median, and maximum timings across all five repetitions.

## Initial transfer size

Real Brotli responses measured by Chromium, including response headers. KiB means 1,024 bytes. Lower is better.

| Locales | Used / route | Catalog | Paraglide JS | Per locale · released | Per locale · optimized | i18next bundled | i18next HTTP catalog | i18next HTTP routes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2 | 50 | 200 | 8.6 KiB | 6.5 KiB | 6.3 KiB | 25.2 KiB | 23.2 KiB | 21.3 KiB |
| 5 | 50 | 200 | 13.1 KiB | 6.5 KiB | 6.3 KiB | 37.2 KiB | 23.3 KiB | 21.3 KiB |
| 10 | 50 | 200 | 22.2 KiB | 6.6 KiB | 6.4 KiB | 58.5 KiB | 23.3 KiB | 21.3 KiB |
| 2 | 50 | 1000 | 8.6 KiB | 6.5 KiB | 6.3 KiB | 49.3 KiB | 35.0 KiB | 24.9 KiB |
| 5 | 50 | 1000 | 13.1 KiB | 6.5 KiB | 6.3 KiB | 97.1 KiB | 35.0 KiB | 24.9 KiB |
| 10 | 50 | 1000 | 22.2 KiB | 6.6 KiB | 6.4 KiB | 179.1 KiB | 35.1 KiB | 24.9 KiB |
| 2 | 200 | 1000 | 16.6 KiB | 11.7 KiB | 10.9 KiB | 50.3 KiB | 36.0 KiB | 25.8 KiB |
| 5 | 200 | 1000 | 31.5 KiB | 11.7 KiB | 10.9 KiB | 98.0 KiB | 36.0 KiB | 25.8 KiB |
| 10 | 200 | 1000 | 60.1 KiB | 11.8 KiB | 11.0 KiB | 180.0 KiB | 36.0 KiB | 25.8 KiB |
| 2 | 50 | 4000 | 8.6 KiB | 6.5 KiB | 6.3 KiB | 130.3 KiB | 74.4 KiB | 34.2 KiB |
| 5 | 50 | 4000 | 13.1 KiB | 6.5 KiB | 6.3 KiB | 289.4 KiB | 74.4 KiB | 34.2 KiB |
| 10 | 50 | 4000 | 22.2 KiB | 6.6 KiB | 6.4 KiB | 569.1 KiB | 74.4 KiB | 34.2 KiB |
| 2 | 200 | 4000 | 16.6 KiB | 11.7 KiB | 10.9 KiB | 131.3 KiB | 75.3 KiB | 35.1 KiB |
| 5 | 200 | 4000 | 31.5 KiB | 11.7 KiB | 10.9 KiB | 290.3 KiB | 75.4 KiB | 35.1 KiB |
| 10 | 200 | 4000 | 60.1 KiB | 11.8 KiB | 11.0 KiB | 570.1 KiB | 75.4 KiB | 35.1 KiB |

## Full journey transfer size

All implementations follow the same journey and reload the document once when switching language. Browser caches stay active within that journey, including across the reload.

| Locales | Used / route | Catalog | Paraglide JS | Per locale · released | Per locale · optimized | i18next bundled | i18next HTTP catalog | i18next HTTP routes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2 | 50 | 200 | 10.8 KiB | 16.2 KiB | 15.5 KiB | 26.1 KiB | 29.3 KiB | 26.9 KiB |
| 5 | 50 | 200 | 16.9 KiB | 16.2 KiB | 15.4 KiB | 38.2 KiB | 29.1 KiB | 26.8 KiB |
| 10 | 50 | 200 | 29.5 KiB | 16.8 KiB | 16.1 KiB | 59.4 KiB | 29.4 KiB | 27.1 KiB |
| 2 | 50 | 1000 | 10.8 KiB | 16.2 KiB | 15.5 KiB | 50.2 KiB | 54.6 KiB | 40.1 KiB |
| 5 | 50 | 1000 | 16.9 KiB | 16.2 KiB | 15.4 KiB | 98.0 KiB | 53.6 KiB | 39.4 KiB |
| 10 | 50 | 1000 | 29.4 KiB | 16.8 KiB | 16.1 KiB | 180.0 KiB | 55.1 KiB | 40.2 KiB |
| 2 | 200 | 1000 | 23.8 KiB | 34.3 KiB | 31.5 KiB | 51.3 KiB | 55.7 KiB | 41.2 KiB |
| 5 | 200 | 1000 | 47.2 KiB | 33.7 KiB | 30.9 KiB | 99.1 KiB | 54.7 KiB | 40.5 KiB |
| 10 | 200 | 1000 | 92.5 KiB | 35.1 KiB | 32.2 KiB | 181.1 KiB | 56.2 KiB | 41.3 KiB |
| 2 | 50 | 4000 | 10.8 KiB | 16.2 KiB | 15.5 KiB | 131.3 KiB | 138.2 KiB | 79.2 KiB |
| 5 | 50 | 4000 | 16.9 KiB | 16.2 KiB | 15.5 KiB | 290.3 KiB | 135.5 KiB | 77.5 KiB |
| 10 | 50 | 4000 | 29.4 KiB | 16.8 KiB | 16.1 KiB | 570.0 KiB | 141.3 KiB | 79.3 KiB |
| 2 | 200 | 4000 | 23.8 KiB | 34.3 KiB | 31.5 KiB | 132.4 KiB | 139.3 KiB | 80.3 KiB |
| 5 | 200 | 4000 | 47.2 KiB | 33.7 KiB | 30.9 KiB | 291.4 KiB | 136.6 KiB | 78.6 KiB |
| 10 | 200 | 4000 | 92.5 KiB | 35.1 KiB | 32.2 KiB | 571.1 KiB | 142.4 KiB | 80.4 KiB |

## Methodology

### Same working application

All six implementations render the same text, interpolation values, five lazy-loaded routes, language controls, plural output, and locale-sensitive dates. The corpus contains distinct Cal.diy translations, with source hashes and the upstream MIT license retained. A fixed hash seed selects messages independently of results. Naturally identical labels remain; translations are not replaced with English copies.

The matrix covers 2, 5, and 10 locales; catalogs of 200, 1,000, and 4,000 messages; and 50 or 200 used messages per route. Combinations unable to supply five routes are excluded before measurement. Twenty messages are shared between routes. Route namespaces partition the remaining catalog evenly; these are controlled boundaries rather than Cal.diy's actual application routes.

The selection aims for 20% interpolated messages until eligible strings are exhausted. Rich markup, nested translations, contextual/plural source keys, and incompatible placeholder sets are excluded from the corpus. Supplemental plural messages test counts 0, 1, 2, 3, 11, and 100. Every variant uses identical native Intl date-formatting code.

### Implementations

| Implementation | Compiler and translation loading |
| --- | --- |
| Paraglide JS | Published 2.29.3; standard message modules, static references, used messages in every configured locale |
| Per locale · released | Published 2.29.3; `experimentalPerLocaleBuild: true` and `outputStructure: "message-modules"` |
| Per locale · optimized | Workspace compiler with message-body inlining enabled; otherwise the same per-locale/message-module setup |
| i18next bundled | All locales and namespaces bundled as compact resource objects |
| i18next HTTP catalog | Official HTTP backend; complete catalog for the active locale |
| i18next HTTP routes | Official HTTP backend; common and current-route namespaces for the active locale |

Page code and translation resources load concurrently for every implementation. Fixed-locale graphs do not call a locale setter at startup. HTTP variants disable fallback languages and retain normal resource caching. Finer namespaces can reduce unused HTTP data further; these results do not represent every possible application configuration.

The optimization places eligible message bodies directly inside their public message functions and removes unused helpers. Locale selection, fallbacks, markup, and locale-override warnings retain their existing contracts. The downloadable metadata identifies the workspace compiler source and compiled-module hashes; the other Paraglide rows use the pinned published package.

### Correctness before performance

All **90 configurations** pass checks across every configured locale and all five routes: **280,500 rendered strings and 15,300 plural outputs**. Every timed journey rechecks text, interpolation, dates, plural categories, and route/locale state. Page errors, failed requests, incorrect translations, and missing compression abort measurement.

Checks of JavaScript actually requested by Chromium verify lazy-route and inactive-locale isolation in all **30 per-locale configurations**. A marker must be observable after navigation or locale switching before its initial absence counts as evidence.

### Browser journey and conditions

Each of **450 measured journeys** starts in a fresh browser context: English route 0 → English route 1 → document navigation to the last configured locale on route 1 → revisit route 0. Every variant reloads once, including i18next. Caches remain active within a journey. Separate preflight checks do not warm measured contexts. This cohort replaces the earlier in-place switching results; the two workloads are not combined.

Trials run sequentially, with order rotated between rounds. Conditions: 40 ms emulated latency, 10 Mbps download, 5 Mbps upload, 4× CPU slowdown, Brotli quality 5, and Vite's default production minification and module preloading. No custom initial-route preload hints are added.

This is a plain Vite client-rendered fixture. Per-locale graphs use Vite's native `createBuilder().buildApp()` API. The results do not establish SSR/hydration behavior or compatibility with TanStack Start/SvelteKit build orchestration. Source maps are disabled; message-module maps can contain inactive locale branches and should remain private. Dynamic indexing of the complete message namespace can retain additional messages. Full document navigation selects another fixed-locale graph.

### Versions and data

Measured October 28, 2026. Published Paraglide **2.29.3**, i18next **26.5.11**, HTTP backend **4.0.6**, Vite **8.3.5**, Playwright **1.50.1**. Host: darwin arm64, Apple M5 Pro, Node v22.17.0, Chromium 133.0.6943.16. Dependencies are pinned in the lockfile.

- [Download summary CSV](/benchmark-data/summary.csv)
- [Download scenario results JSON](/benchmark-data/results.json)
- [Benchmark source](https://github.com/opral/paraglide-js/tree/main/benchmark)

## Reproduce and contribute

From the repository root:

```sh
pnpm install --frozen-lockfile
pnpm --filter @inlang/paraglide-js-benchmark exec playwright install --only-shell chromium
pnpm --filter @inlang/paraglide-js-benchmark bench
```

The runner builds the workspace compiler, builds the matrix, checks every locale/route, measures five sequential repetitions, and updates this page and the explorer's compact dataset. Only the two compact result files are committed. Raw trial logs, generated app builds, and diagnostics remain ignored under `benchmark/.work/benchmark/`.

Use `SMOKE=1 pnpm --filter @inlang/paraglide-js-benchmark bench` for one scenario and one repetition; smoke runs cannot overwrite published results. Use `pnpm --filter @inlang/paraglide-js-benchmark publish-results --saved` to regenerate this page from committed results. The page serves complete tables and the explorer's initial state as HTML for crawlers and readers without JavaScript.
