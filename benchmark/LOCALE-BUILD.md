# Per-locale build benchmark

Measured October 28, 2026 at 12:51 PM CST. Separate cohort from the published in-place language-switching benchmark: 75 application configurations, five repetitions, and 375 validated journeys.

## What changes

The experimental variant uses the published Paraglide 2.29.3 Vite plugin with `experimentalPerLocaleBuild: true` and its default `locale-modules` output. It runs through `createBuilder().buildApp()`; deployment selects the native HTML/asset graph from `paraglide-vite-locales.json`. The emitted graphs are copied intact to the benchmark server. There are no compiler changes or extra output optimizations. Default Paraglide uses its normal `message-modules` output. Both use static message references through the generated messages entry point.

All implementations use the same client-rendered application, source translations, interpolation values, native Intl date formatting, and plural assertions. Locale counts are 2, 5, and 10; catalog sizes are 200, 1,000, and 4,000; pages use 50 or 200 messages where the catalog can supply five routes. Initial language is English. The existing HTTP catalog and route-namespace implementations remain separate.

Each journey starts with an empty browser-context cache: English route 0 → English route 1 → switch once to the last configured language with a full document navigation to route 1 → visit route 0 in that language. Every implementation reloads for the language change. Browser HTTP caches remain enabled throughout, including across the reload; an in-memory i18next instance is recreated with the document. Route changes within a language use dynamic imports.

The main metric is navigation start to translated text in the DOM. It includes resource loading, initialization, translation, and DOM updates, and excludes LCP, paint, and general interaction readiness. For language changes, the readiness clock starts at the new document's navigation start. Full-journey bytes include the initial load, route navigation, one language change, and the final route visit.

## Per-locale wins by competitor

Counts compare medians across 15 scenarios. Small timing differences can be noise; five runs on one host do not establish universal performance.

| Compared with | Initial DOM readiness | Initial wire bytes | Journey wire bytes |
| --- | --- | --- | --- |
| Default Paraglide | 10/15 | 10/15 | 5/15 |
| i18next bundled | 15/15 | 15/15 | 14/15 |
| i18next HTTP catalog | 15/15 | 15/15 | 12/15 |
| i18next HTTP routes | 15/15 | 12/15 | 12/15 |

Per-locale output reduces initial readiness time and transfer size compared with default Paraglide in the tested five- and ten-locale scenarios. Default Paraglide remains smaller and faster initially in all five two-locale scenarios, although some timing differences are only a few milliseconds.

The experimental layout removes inactive languages, but its shared locale chunk in this fixture eagerly includes messages used by later routes. Preserving route-level message splitting within each locale graph is the next optimization to evaluate. A language change also loads a new graph, whereas default Paraglide can reuse already cached multilingual modules. The journey tables retain that cost even though language changes are limited to one per journey.

## Initial translated DOM readiness

| Locales | Used / route | Catalog | Default Paraglide | Per-locale Paraglide | i18next bundled | i18next HTTP catalog | i18next HTTP routes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2 | 50 | 200 | 175 ms | 176 ms | 198 ms | 264 ms | 265 ms |
| 5 | 50 | 200 | 181 ms | 178 ms | 211 ms | 263 ms | 265 ms |
| 10 | 50 | 200 | 186 ms | 178 ms | 230 ms | 268 ms | 265 ms |
| 2 | 50 | 1000 | 175 ms | 177 ms | 221 ms | 281 ms | 264 ms |
| 5 | 50 | 1000 | 179 ms | 176 ms | 268 ms | 282 ms | 263 ms |
| 10 | 50 | 1000 | 185 ms | 178 ms | 350 ms | 284 ms | 264 ms |
| 2 | 200 | 1000 | 183 ms | 195 ms | 230 ms | 290 ms | 269 ms |
| 5 | 200 | 1000 | 198 ms | 194 ms | 283 ms | 290 ms | 270 ms |
| 10 | 200 | 1000 | 221 ms | 196 ms | 364 ms | 292 ms | 271 ms |
| 2 | 50 | 4000 | 176 ms | 178 ms | 306 ms | 312 ms | 280 ms |
| 5 | 50 | 4000 | 179 ms | 178 ms | 494 ms | 311 ms | 281 ms |
| 10 | 50 | 4000 | 188 ms | 177 ms | 812 ms | 309 ms | 277 ms |
| 2 | 200 | 4000 | 185 ms | 194 ms | 312 ms | 320 ms | 284 ms |
| 5 | 200 | 4000 | 198 ms | 193 ms | 501 ms | 319 ms | 285 ms |
| 10 | 200 | 4000 | 221 ms | 196 ms | 812 ms | 319 ms | 283 ms |

## Initial Brotli transfer

Wire sizes include response headers, as reported by Chromium. KiB = 1,024 bytes.

| Locales | Used / route | Catalog | Default Paraglide | Per-locale Paraglide | i18next bundled | i18next HTTP catalog | i18next HTTP routes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2 | 50 | 200 | 8.6 KiB | 9.8 KiB | 25.1 KiB | 23.2 KiB | 21.3 KiB |
| 5 | 50 | 200 | 13.1 KiB | 9.8 KiB | 37.2 KiB | 23.2 KiB | 21.3 KiB |
| 10 | 50 | 200 | 22.2 KiB | 9.9 KiB | 58.4 KiB | 23.2 KiB | 21.3 KiB |
| 2 | 50 | 1000 | 8.6 KiB | 9.8 KiB | 49.3 KiB | 35.0 KiB | 24.8 KiB |
| 5 | 50 | 1000 | 13.1 KiB | 9.8 KiB | 97.1 KiB | 35.0 KiB | 24.9 KiB |
| 10 | 50 | 1000 | 22.2 KiB | 9.9 KiB | 179.0 KiB | 35.0 KiB | 24.9 KiB |
| 2 | 200 | 1000 | 16.6 KiB | 26.4 KiB | 50.2 KiB | 35.9 KiB | 25.8 KiB |
| 5 | 200 | 1000 | 31.4 KiB | 26.4 KiB | 98.0 KiB | 36.0 KiB | 25.8 KiB |
| 10 | 200 | 1000 | 60.1 KiB | 26.5 KiB | 180.0 KiB | 36.0 KiB | 25.8 KiB |
| 2 | 50 | 4000 | 8.6 KiB | 9.8 KiB | 130.3 KiB | 74.4 KiB | 34.1 KiB |
| 5 | 50 | 4000 | 13.1 KiB | 9.8 KiB | 289.4 KiB | 74.4 KiB | 34.1 KiB |
| 10 | 50 | 4000 | 22.2 KiB | 9.9 KiB | 569.1 KiB | 74.4 KiB | 34.2 KiB |
| 2 | 200 | 4000 | 16.6 KiB | 26.4 KiB | 131.3 KiB | 75.3 KiB | 35.1 KiB |
| 5 | 200 | 4000 | 31.4 KiB | 26.4 KiB | 290.3 KiB | 75.3 KiB | 35.1 KiB |
| 10 | 200 | 4000 | 60.1 KiB | 26.5 KiB | 570.0 KiB | 75.4 KiB | 35.1 KiB |

## Journey Brotli transfer with one language change

| Locales | Used / route | Catalog | Default Paraglide | Per-locale Paraglide | i18next bundled | i18next HTTP catalog | i18next HTTP routes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2 | 50 | 200 | 10.8 KiB | 21.6 KiB | 26.1 KiB | 29.3 KiB | 26.9 KiB |
| 5 | 50 | 200 | 16.9 KiB | 21.4 KiB | 38.2 KiB | 29.0 KiB | 26.8 KiB |
| 10 | 50 | 200 | 29.4 KiB | 21.7 KiB | 59.4 KiB | 29.4 KiB | 27.1 KiB |
| 2 | 50 | 1000 | 10.8 KiB | 21.6 KiB | 50.2 KiB | 54.6 KiB | 40.1 KiB |
| 5 | 50 | 1000 | 16.9 KiB | 21.4 KiB | 98.0 KiB | 53.6 KiB | 39.4 KiB |
| 10 | 50 | 1000 | 29.4 KiB | 21.7 KiB | 180.0 KiB | 55.1 KiB | 40.2 KiB |
| 2 | 200 | 1000 | 23.8 KiB | 57.8 KiB | 51.3 KiB | 55.7 KiB | 41.2 KiB |
| 5 | 200 | 1000 | 47.2 KiB | 57.1 KiB | 99.1 KiB | 54.7 KiB | 40.5 KiB |
| 10 | 200 | 1000 | 92.5 KiB | 58.5 KiB | 181.1 KiB | 56.2 KiB | 41.3 KiB |
| 2 | 50 | 4000 | 10.8 KiB | 21.6 KiB | 131.2 KiB | 138.2 KiB | 79.1 KiB |
| 5 | 50 | 4000 | 16.9 KiB | 21.4 KiB | 290.3 KiB | 135.5 KiB | 77.5 KiB |
| 10 | 50 | 4000 | 29.4 KiB | 21.8 KiB | 570.0 KiB | 141.3 KiB | 79.3 KiB |
| 2 | 200 | 4000 | 23.8 KiB | 57.8 KiB | 132.3 KiB | 139.3 KiB | 80.2 KiB |
| 5 | 200 | 4000 | 47.2 KiB | 57.1 KiB | 291.4 KiB | 136.6 KiB | 78.6 KiB |
| 10 | 200 | 4000 | 92.5 KiB | 58.5 KiB | 571.1 KiB | 142.4 KiB | 80.4 KiB |

## Language-change DOM readiness

| Locales | Used / route | Catalog | Default Paraglide | Per-locale Paraglide | i18next bundled | i18next HTTP catalog | i18next HTTP routes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2 | 50 | 200 | 61 ms | 157 ms | 68 ms | 118 ms | 113 ms |
| 5 | 50 | 200 | 63 ms | 155 ms | 73 ms | 120 ms | 112 ms |
| 10 | 50 | 200 | 63 ms | 156 ms | 76 ms | 119 ms | 117 ms |
| 2 | 50 | 1000 | 62 ms | 158 ms | 75 ms | 138 ms | 114 ms |
| 5 | 50 | 1000 | 61 ms | 153 ms | 83 ms | 137 ms | 115 ms |
| 10 | 50 | 1000 | 67 ms | 155 ms | 100 ms | 142 ms | 115 ms |
| 2 | 200 | 1000 | 60 ms | 174 ms | 77 ms | 141 ms | 118 ms |
| 5 | 200 | 1000 | 61 ms | 171 ms | 88 ms | 139 ms | 118 ms |
| 10 | 200 | 1000 | 65 ms | 175 ms | 101 ms | 144 ms | 120 ms |
| 2 | 50 | 4000 | 61 ms | 156 ms | 91 ms | 178 ms | 132 ms |
| 5 | 50 | 4000 | 61 ms | 156 ms | 126 ms | 177 ms | 134 ms |
| 10 | 50 | 4000 | 63 ms | 156 ms | 189 ms | 189 ms | 135 ms |
| 2 | 200 | 4000 | 61 ms | 176 ms | 95 ms | 180 ms | 135 ms |
| 5 | 200 | 4000 | 63 ms | 174 ms | 129 ms | 180 ms | 134 ms |
| 10 | 200 | 4000 | 65 ms | 175 ms | 188 ms | 188 ms | 136 ms |

## Conditions and validation

Same profile as the published benchmark: 40 ms emulated latency, 10 Mbps download, 5 Mbps upload, 4× CPU throttling, actual Brotli at quality 5, production minification and Vite module preloading enabled. Trials run sequentially with implementation order rotated between repetitions. Host: darwin arm64, Apple M5 Pro, Node v22.17.0, Chromium 133.0.6943.16. Versions: @inlang/paraglide-js 2.29.3, @inlang/plugin-i18next 6.4.4, i18next 26.5.11, i18next-http-backend 4.0.6, vite 8.3.5, playwright 1.50.1.

All 75 configurations passed every configured locale and all five routes before measurement: 233,750 rendered strings and 12,750 plural outputs. Every timed journey also validates rendered text, interpolation, locale, route, plurals, dates, and compressed responses; browser errors abort measurement.

## Reproduce

From the repository root after installing the pinned dependencies and Chromium:

```sh
pnpm --filter @inlang/paraglide-js-benchmark bench:locales
```

`SMOKE=1` runs one scenario and one repetition without replacing committed results. The runner keeps all builds and diagnostic logs in ignored `benchmark/.work/locale-build/`. Only [compact scenario results](./results/locale-build.json) and [CSV](./results/locale-build.csv) are committed. Timing and transfer ranges are retained in the compact JSON. Use `bench:locales --saved` to regenerate the compact results and this report from a completed local run.
