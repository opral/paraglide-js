---
description: "Compare Paraglide JS and i18next: translated DOM readiness, Brotli transfer, per-locale splitting, and reproducible Vite 8 results."
---

# Paraglide JS vs i18next benchmark

Compare **translated DOM readiness** and **Brotli transfer** for the same Vite 8 app: default and per-locale Paraglide JS, bundled i18next, and two HTTP-backend configurations.

## Main findings

- **Per-locale Paraglide reaches translated DOM readiness sooner in 45/45 pairwise comparisons** against i18next. Initial and journey transfer are smaller in 45/45 and 45/45 comparisons, respectively.
- **Default Paraglide has transfer tradeoffs:** initial or journey bytes exceed an i18next configuration in 6/45 comparisons. All results remain visible below.

With ten locales, 200 messages used per route, and a 1,000-message catalog, per-locale Paraglide reaches readiness in 177 ms with 11.0 KiB initial transfer; route-based HTTP i18next takes 220 ms and 25.8 KiB. These are five-run medians from one host and network profile, not universal rankings.

## Interactive examples

Filter locale counts, message counts, and metrics. Complete scenario tables follow.

<div data-benchmark-explorer=""></div>

## Translated DOM readiness

Navigation start until translated text is inserted into the DOM, including loading, initialization, translation, and DOM updates. **This is not paint, LCP, INP, or general interaction readiness.** Lower is better; downloadable data retains minimum, median, and maximum values.

| Locales | Used / route | Catalog | Paraglide JS | Paraglide · per locale | i18next bundled | i18next HTTP catalog | i18next HTTP routes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2 | 50 | 200 | 174 ms | 173 ms | 198 ms | 210 ms | 214 ms |
| 5 | 50 | 200 | 178 ms | 173 ms | 209 ms | 212 ms | 211 ms |
| 10 | 50 | 200 | 185 ms | 171 ms | 228 ms | 214 ms | 209 ms |
| 2 | 50 | 1000 | 173 ms | 173 ms | 223 ms | 233 ms | 213 ms |
| 5 | 50 | 1000 | 177 ms | 173 ms | 269 ms | 234 ms | 212 ms |
| 10 | 50 | 1000 | 186 ms | 172 ms | 348 ms | 234 ms | 220 ms |
| 2 | 200 | 1000 | 184 ms | 176 ms | 230 ms | 236 ms | 223 ms |
| 5 | 200 | 1000 | 196 ms | 177 ms | 277 ms | 239 ms | 222 ms |
| 10 | 200 | 1000 | 219 ms | 177 ms | 353 ms | 238 ms | 220 ms |
| 2 | 50 | 4000 | 175 ms | 172 ms | 303 ms | 262 ms | 226 ms |
| 5 | 50 | 4000 | 180 ms | 172 ms | 485 ms | 259 ms | 227 ms |
| 10 | 50 | 4000 | 187 ms | 173 ms | 804 ms | 257 ms | 230 ms |
| 2 | 200 | 4000 | 183 ms | 178 ms | 310 ms | 266 ms | 234 ms |
| 5 | 200 | 4000 | 195 ms | 176 ms | 495 ms | 266 ms | 232 ms |
| 10 | 200 | 4000 | 218 ms | 178 ms | 803 ms | 266 ms | 232 ms |

## Initial transfer size

Chromium-measured Brotli responses, including response headers. KiB means 1,024 bytes; lower is better.

| Locales | Used / route | Catalog | Paraglide JS | Paraglide · per locale | i18next bundled | i18next HTTP catalog | i18next HTTP routes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2 | 50 | 200 | 8.6 KiB | 6.3 KiB | 25.2 KiB | 23.2 KiB | 21.3 KiB |
| 5 | 50 | 200 | 13.1 KiB | 6.3 KiB | 37.2 KiB | 23.3 KiB | 21.3 KiB |
| 10 | 50 | 200 | 22.2 KiB | 6.4 KiB | 58.5 KiB | 23.3 KiB | 21.3 KiB |
| 2 | 50 | 1000 | 8.6 KiB | 6.3 KiB | 49.3 KiB | 35.0 KiB | 24.9 KiB |
| 5 | 50 | 1000 | 13.1 KiB | 6.3 KiB | 97.1 KiB | 35.0 KiB | 24.9 KiB |
| 10 | 50 | 1000 | 22.2 KiB | 6.4 KiB | 179.1 KiB | 35.1 KiB | 24.9 KiB |
| 2 | 200 | 1000 | 16.6 KiB | 10.9 KiB | 50.3 KiB | 36.0 KiB | 25.8 KiB |
| 5 | 200 | 1000 | 31.5 KiB | 10.9 KiB | 98.0 KiB | 36.0 KiB | 25.8 KiB |
| 10 | 200 | 1000 | 60.1 KiB | 11.0 KiB | 180.0 KiB | 36.0 KiB | 25.8 KiB |
| 2 | 50 | 4000 | 8.6 KiB | 6.3 KiB | 130.3 KiB | 74.4 KiB | 34.2 KiB |
| 5 | 50 | 4000 | 13.1 KiB | 6.3 KiB | 289.4 KiB | 74.4 KiB | 34.2 KiB |
| 10 | 50 | 4000 | 22.2 KiB | 6.4 KiB | 569.1 KiB | 74.4 KiB | 34.2 KiB |
| 2 | 200 | 4000 | 16.6 KiB | 10.9 KiB | 131.3 KiB | 75.3 KiB | 35.1 KiB |
| 5 | 200 | 4000 | 31.5 KiB | 10.9 KiB | 290.3 KiB | 75.4 KiB | 35.1 KiB |
| 10 | 200 | 4000 | 60.1 KiB | 11.0 KiB | 570.1 KiB | 75.4 KiB | 35.1 KiB |

## Full journey transfer size

Total bytes across the journey below, including one document reload when changing language. Caches remain active within each journey.

| Locales | Used / route | Catalog | Paraglide JS | Paraglide · per locale | i18next bundled | i18next HTTP catalog | i18next HTTP routes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2 | 50 | 200 | 10.8 KiB | 15.5 KiB | 26.1 KiB | 29.3 KiB | 26.9 KiB |
| 5 | 50 | 200 | 16.9 KiB | 15.4 KiB | 38.2 KiB | 29.1 KiB | 26.8 KiB |
| 10 | 50 | 200 | 29.5 KiB | 16.1 KiB | 59.4 KiB | 29.4 KiB | 27.1 KiB |
| 2 | 50 | 1000 | 10.8 KiB | 15.5 KiB | 50.2 KiB | 54.6 KiB | 40.1 KiB |
| 5 | 50 | 1000 | 16.9 KiB | 15.4 KiB | 98.0 KiB | 53.6 KiB | 39.4 KiB |
| 10 | 50 | 1000 | 29.4 KiB | 16.1 KiB | 180.0 KiB | 55.1 KiB | 40.2 KiB |
| 2 | 200 | 1000 | 23.8 KiB | 31.5 KiB | 51.3 KiB | 55.7 KiB | 41.2 KiB |
| 5 | 200 | 1000 | 47.2 KiB | 30.9 KiB | 99.1 KiB | 54.7 KiB | 40.5 KiB |
| 10 | 200 | 1000 | 92.5 KiB | 32.2 KiB | 181.1 KiB | 56.2 KiB | 41.3 KiB |
| 2 | 50 | 4000 | 10.8 KiB | 15.5 KiB | 131.3 KiB | 138.2 KiB | 79.2 KiB |
| 5 | 50 | 4000 | 16.9 KiB | 15.5 KiB | 290.3 KiB | 135.5 KiB | 77.5 KiB |
| 10 | 50 | 4000 | 29.4 KiB | 16.1 KiB | 570.0 KiB | 141.3 KiB | 79.3 KiB |
| 2 | 200 | 4000 | 23.8 KiB | 31.5 KiB | 132.4 KiB | 139.3 KiB | 80.3 KiB |
| 5 | 200 | 4000 | 47.2 KiB | 30.9 KiB | 291.4 KiB | 136.6 KiB | 78.6 KiB |
| 10 | 200 | 4000 | 92.5 KiB | 32.2 KiB | 571.1 KiB | 142.4 KiB | 80.4 KiB |

## Methodology

### Same working application

All five configurations render identical text, interpolation, plurals, dates, and five lazy routes with 20 shared messages. Distinct [Cal.diy translations, source hashes, and MIT license](https://github.com/opral/paraglide-js/tree/main/benchmark/corpus) are retained. Fixed-hash selection is independent of results; naturally identical labels remain.

The matrix covers 2/5/10 locales, 200/1,000/4,000 catalog messages, and 50/200 used messages per route. Combinations unable to supply five routes are excluded. Common/route namespaces partition the catalog; these are controlled boundaries, not Cal.diy's routes.

Selection targets 20% interpolation until eligible strings run out. Rich markup, nested translations, contextual/plural source keys, and incompatible placeholders are excluded. Supplemental plurals test counts 0, 1, 2, 3, 11, and 100. Dates use identical native Intl code.

### Implementations

| Implementation | Translation loading |
| --- | --- |
| Paraglide JS | Message modules; unused messages removed, retained messages include every locale |
| Paraglide · per locale | Fixed-locale builds with message modules and static references |
| i18next bundled | All locales and namespaces bundled as compact objects |
| i18next HTTP catalog | Official HTTP backend; complete active-locale catalog |
| i18next HTTP routes | Official HTTP backend; active-locale common/route namespaces |

Per-locale settings: `experimentalPerLocaleBuild: true` and `outputStructure: "message-modules"`.

Per-locale results use the compiler in this repository; downloadable metadata records source and compiled hashes. Vite groups message modules into page/shared chunks, without per-message requests. Dynamic namespace indexing can retain additional messages. See the [per-locale setup and framework constraints](/compiling-messages).

Page code and translations load concurrently. Fixed-locale graphs avoid startup locale setters. HTTP variants disable fallback languages and retain resource caching; finer namespaces can reduce unused data further.

### Correctness before performance

All **75 configurations** pass **233,750 string checks and 12,750 plural assertions** across every locale/route. Timed journeys recheck text, interpolation, dates, plurals, and route/locale state. Errors, failed requests, or missing compression abort measurement. Requested-JavaScript checks verify route and locale isolation in all **15 per-locale configurations**, using markers observable after navigation.

### Browser journey and conditions

Each of **375 journeys** starts with a fresh browser context: English route 0 → English route 1 → document navigation to the last configured locale on route 1 → revisit route 0. Every implementation reloads once. Preflight checks never warm measured contexts.

Trials run sequentially with rotated order: **40 ms latency, 10 Mbps down, 5 Mbps up, 4× CPU slowdown, Brotli quality 5**. Vite's default minification/module preloading remain enabled; no custom initial-route hints are added.

Five-run medians do not establish statistical significance across devices. Per-locale builds are experimental. This plain-Vite client-rendered fixture does not establish SSR/hydration behavior or TanStack Start/SvelteKit compatibility. Source maps are disabled; keep message-module maps private because they can contain inactive-locale branches.

### Versions and data

Measured October 28, 2026. Pinned packages: Paraglide **2.29.3**, i18next **26.5.11**, HTTP backend **4.0.6**, Vite **8.3.5**, Playwright **1.50.1**. Host: darwin arm64, Apple M5 Pro, Node v22.17.0, Chromium 133.0.6943.16.

- [Summary CSV](/benchmark-data/summary.csv)
- [Scenario results JSON](/benchmark-data/results.json)
- [Benchmark source](https://github.com/opral/paraglide-js/tree/main/benchmark)

## Reproduce and contribute

From the repository root:

```sh
pnpm install --frozen-lockfile
pnpm --filter @inlang/paraglide-js-benchmark exec playwright install --only-shell chromium
pnpm --filter @inlang/paraglide-js-benchmark bench
```

Use `SMOKE=1` for one scenario/repetition without replacing published results. Run `pnpm --filter @inlang/paraglide-js-benchmark publish-results --saved` to regenerate this page from saved data. Results render as HTML; JavaScript adds filtering.
