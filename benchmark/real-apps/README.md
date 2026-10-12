# Real i18next catalog experiments

The continued campaign includes [114 output experiment cells](round2-output-experiments.md)
and [12 selected-locale payload probes](round2-locale-payload-experiment.md),
[six additional native app builds](native-route-additions.md),
the [Open WebUI sign-in baseline](native-openweb-auth-fixture.md), and recorded
[Chatbox](chatbox-results.md) / [Stirling-PDF](stirling-results.md) near-misses.
The [automatic Vite client locale-splitting ledger](locale-split-experiment.md)
contains the public-plugin route gate, constrained-network repeat, native
comparison, and fast-network regression. Component savings are not route savings.

These experiments run real catalog text through Paraglide's compiler and **Vite production minification and tree shaking**, then check translation equality and count emitted JavaScript bytes after gzip/Brotli compression. Source-code shortening that Vite already performs does not count as an improvement.

The complete-catalog workload deliberately keeps every key reachable, so it measures isolated localization JS rather than a production page. DrawDB embeds all locales in production. Memos dynamically loads locales: its all-locales workload is a stress test, not an initial-page comparison. The native comparator preserves source catalog hierarchy and property order; flattened paths are used only to build compiler messages. The runner fails closed on unsupported syntax; it excludes two plural keys from Memos on both sides. This adapter is benchmark scaffolding, not a supported i18next migration tool.

## Reproduce

Install this repository with the lockfile, run `pnpm run env-variables` and `pnpm exec tsc --build`. Install benchmark dependencies with `pnpm install --filter @inlang/paraglide-js-benchmark --frozen-lockfile`.

Check out these immutable inputs outside this repository:

- `drawdb-io/drawdb@351bd6050692d5b7d7fb50cc283ef90a19d817ea`; run `npm ci` there (i18next 23.16.8).
- `usememos/memos@a668bb8f7e3652be029459bc80bd3bffb86f0542`; the isolated runner needs only its catalogs. Run `npm install --prefix .real-apps/deps-memos --no-audit --no-fund --ignore-scripts i18next@26.3.6` from this repository.

```sh
node benchmark/real-apps/run.mjs drawdb /absolute/path/to/drawdb inline dist
node benchmark/real-apps/run.mjs memos /absolute/path/to/memos inline dist
```

Use the compiler at main `9446dd98ff578c96d76fe40b22be268bf7ac17ed` for the baseline. Build its `dist`, then copy that complete directory to `.real-apps/baseline-compiler` and provide that as the fourth argument:

```sh
node benchmark/real-apps/run.mjs drawdb /absolute/path/to/drawdb baseline .real-apps/baseline-compiler
node benchmark/real-apps/run.mjs memos /absolute/path/to/memos baseline .real-apps/baseline-compiler
```

Results include app SHA, catalog and compiler artifact SHA-256 hashes, actual i18next version, explicit-locale output parity, selected-locale parity after switching, emitted bytes, and raw timing rounds. Byte comparisons are deterministic for the same toolchain. Node call timings are diagnostic warm microbenchmarks; build/import/initialization time is outside that loop.

For a localization-only browser startup fixture:

```sh
pnpm --filter @inlang/paraglide-js-benchmark exec playwright install --only-shell chromium
node benchmark/real-apps/browser.mjs drawdb baseline inline
```

This serves real gzip response bodies, disables cache, uses fresh browser contexts, 1.6 Mbps download, 150 ms latency, and 4x CPU throttling. It alternates order for 13 rounds, discards two warm-ups, verifies visible output equality, and records raw rounds. Its LCP is **fixture LCP**, not the production application's LCP. Whole-app migrations and measured request graphs are reported separately; do not extrapolate a localization-byte improvement to an equally large whole-app improvement.

## User evidence driving the metrics

- [Paraglide #668](https://github.com/opral/paraglide-js/issues/668): shared message chunks delivering unrelated route translations.
- [Paraglide #88](https://github.com/opral/paraglide-js/issues/88): locale payloads and render/fetch waterfalls.
- [i18next #1318](https://github.com/i18next/i18next/issues/1318): shipped JS and parse/CPU cost.
- [i18next #1418](https://github.com/i18next/i18next/issues/1418): smaller locale-specific bundles.
- [i18next #2449](https://github.com/i18next/i18next/issues/2449): initialization work with large resources.

Compiler/build time reports in both projects were inspected, but SDK/Lix compilation changes are excluded from this experiment.

## Output layouts and whole-app reproduction

The standard compiler enables literal inlining for `message-modules`. The CLI and standalone compiler retain the existing language-grouped helpers for `locale-modules`: flattening those strings into per-message dispatchers regressed gzip in the audit. Vite production locale builds can additionally pack surviving static helpers after tree shaking, with the unchanged public message API. The standalone low-level `compileBundle` API keeps its previous output unless its layout caller explicitly opts into literal inlining. No new `CompilerOptions` setting is needed.

The guarded `locale-modules` artifacts have matching emitted raw/gzip/Brotli byte counts with main for both catalogs; the baseline and guarded results are checked in. To repeat a layout comparison, set `PARAGLIDE_OUTPUT_STRUCTURE=locale-modules` when invoking `run.mjs`.

For the pinned full DrawDB Vite app and its actual routes, run `migrate-drawdb.mjs` followed by `drawdb-browser.mjs` after generating `baseline` and `inline` catalog outputs. See `drawdb-results.md` for exact inputs, the adapter's bounded compatibility, rendered-text checks, and the whole-app denominator. The gzip whole-app result remains 1.6% larger than native i18next; the local Brotli route transfer is effectively equal, with no demonstrated LCP gain.

The second draft's same-layout locale packing results and production fallback limits are in [locale-packing-results.md](locale-packing-results.md). See [native-route-survey.md](native-route-survey.md) for additional native page baselines and the limits on app-wide migration claims.

## Third app: AnythingLLM

`anything-llm-results.md` records the pinned eager-loading app, a native French onboarding route, and four isolated catalog variants using the app's actual Vite 4.5.3 and i18next 23.12.1. The runner accepts `anything-llm` and selects that checkout's installed Vite. Six plural keys are excluded symmetrically; string parity does not establish React `<Trans>` rendering parity or a whole-app migration.

## Default dispatcher matrices and production migration

The third draft packs surviving default-layout static dispatchers after tree shaking. [dispatch-matrix-results.md](dispatch-matrix-results.md) records the three component gates and the full AnythingLLM onboarding comparison. The production route saves 51.6% of same-origin subresource transfer versus its pinned native i18next control; that counter includes response headers and excludes the HTML document. Follow [anything-migration/README.md](anything-migration/README.md) for the separate full-app replay. Component figures and route figures have different denominators.
