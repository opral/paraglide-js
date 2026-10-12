# Independent review: AnythingLLM `/onboarding` migration

## Finding

The saved result is credible evidence that migrating this pinned AnythingLLM frontend from its current eager i18next setup to generated Paraglide message modules materially reduces a cold `/onboarding` load. It supports a claim about this route and this app architecture. It does not establish a whole-app average, an optimized i18next comparison, an offline/PWA benefit, or a general result for other apps.

The primary run uses AnythingLLM `2a10d052a1812d7be12c43f9024072cf26a27a8b`, Node `v22.23.2`, Vite `4.5.3`, i18next `23.12.1`, and Chromium `143.0.7499.4`. With `fr-FR`, 80 ms emulated latency, 20 Mbps down, 2 Mbps up, 3x CPU throttling, disabled cache, and five alternating paired trials, the saved current-dist report gives:

| Cold `/onboarding` measure                 | Native metadata control | Paraglide migration | Change |
| ------------------------------------------ | ----------------------: | ------------------: | -----: |
| Main JS, Brotli Q4                         |               882,395 B |           364,213 B | -58.7% |
| Same-origin subresource `transferSize` sum |             1,004,360 B |           486,178 B | -51.6% |
| Median FCP/LCP                             |                  764 ms |              532 ms | -30.4% |

The browser result sums `performance.getEntriesByType("resource").transferSize` for same-origin subresources. Each entry includes response headers as well as the encoded response body, so the 1,004,360 B and 486,178 B values are subresource transfer totals, not Brotli body-only totals. The sum excludes the top-level navigation/document entry; the HTML is 1,921 raw / 538 B Brotli in both builds. The test server serves Brotli Q4 bodies, and the main-JS Brotli figures above are separately reproducible from the built files. The subresource delta is 518,182 B, matching the main-JS compressed-body delta; the measured non-main remainder is the same in both variants.

The five current-dist trials have identical page text (`Bienvenue\nCommencer`) and no page errors. Two earlier five-pair runs are retained in `route-perf-cross-replicates.json`; they used a prior compiler dist and are useful diagnostics, not the primary result. The pooled 15-trial median should remain secondary to the latest current-dist run.

## Baseline and shipped output

The native control is a close control for the app’s existing production architecture. `prepare-native-metadata-control.mjs` changes only how `useLanguageOptions` gets its locale ID list: it replaces enumeration of `resources` with the same static ordered list. The app’s stock `i18n.js` still statically imports `resources.js` and initializes i18next with all locales. The native control emits all 31 native locale modules (2,574,707 rendered module bytes) and 17 modules whose paths identify i18next/react-i18next (122,970 rendered module bytes). Its main JS differs from the stock native build by only +234 raw and +106 gzip bytes; the native control therefore retains the translation payload the app’s current design actually ships.

The Paraglide build emits zero native locale catalog modules and zero i18next/react-i18next package modules. It still contains generated translations: 168 generated message modules in the main entry and 950 across the full 83-chunk output. Vite removes 307 of the 1,257 generated message keys from the emitted graph. These figures distinguish removal of the original catalogs from removal of translation data altogether.

This is a fair comparison to the pinned app as it exists, but not to a deliberately optimized i18next design that lazily loads a locale or route namespace. Some of the measured gain comes from replacing this app’s eager all-locale resource import and i18next runtime; the result should not be described as a 51.6% compiler-only win against every i18next configuration.

The production route comparison uses the actual Vite-built app outputs. Its HTML fallback serves `/onboarding`; the harness mocks read-only GETs to `/api/onboarding` and `/api/system/logo`, rejects unmodeled API calls, and checks the rendered French title and button text. This establishes the startup path under those fixtures, not behavior that depends on authentication, real backend responses, or later interactions.

## Parity evidence and migration limits

I reran `verify-catalog.mjs` and `check-trans.mjs` from the migration scratch directory under Node `v22.23.2`. They passed 38,192 ordinary locale/key comparisons, 837 numeric plural comparisons, nine locale/fallback contexts (including `fr-FR → fr`, `zh-TW → zh-tw`, `pt-BR → pt`, and `vi-VN → vi`), and 496 server-rendered `Trans` key/locale comparisons. I also compared the native i18next and generated compatibility adapter’s nested `returnObjects` results for five greeting buckets across all 31 locales (155 comparisons); all matched. This adds coverage for the greeting-object adapter path beyond the saved catalog and `Trans` checks.

The generator flattens the source’s nested string catalogs, explicitly handles its three numeric plural bases, adapts 16 rich `Trans` messages, and reconstructs the dynamic greeting object. The source has six nonliteral `t(...)` call sites; the compatibility layer covers the known shortcut, reasoning-effort, greeting, quantifier, scheduled-job-status, and chat-mode patterns. The 496 `Trans` checks use synthesized components and server rendering, rather than mounting every source call site. The measured route itself exercises neither plural selection nor `Trans`, dynamic keys, or greetings. So the evidence is broad source-data parity plus one integrated route smoke test, not end-to-end coverage of every migrated screen.

`prepare-app.mjs` converts mapped static calls written as `t(key, "default text")` to direct message calls without forwarding that second string. I found 15 such call sites (10 unique key/default pairs) and compared native `getFixedT` results with the generated message or adapter result across all 31 locales (310 unique key/locale comparisons); there were no mismatches. Four calls for two keys absent from the catalogs remain on the adapter path, which preserves their default text. The other keys are present in the pinned catalogs and their generated output matches native i18next. The omitted argument is therefore not a current pinned-source mismatch, but the scratch transformer would need a guard or revised semantics before reusing it with changed catalogs where a mapped key disappears everywhere.

The app scratch build calls the compiler’s internal `compileBundleForVite` entry and imports the dispatch-matrix packer directly in its Vite config. It records the compiler source and dist hashes in `experiment-pin.json`, including the exact packer hash. This is good evidence for the generated output path under test, but the scratch migration is not a public, documented i18next migration API. Also, the module inventory records Rollup `generateBundle` module lengths; use the built-file compression and browser route report, rather than summing those module lengths, for shipped-byte claims.

## Scope not measured

`route-perf.mjs` creates fresh contexts, disables the HTTP cache, and sets Playwright `serviceWorkers: "block"`. It therefore measures the cold page request graph without service-worker installation, cache population, offline reload, or update behavior. The pinned app source has an optional push-notification service worker used from Scheduled Jobs; the onboarding test does not exercise it. Do not extend this route denominator to an offline/install closure.

Only `/onboarding` is measured. The inventory shows route-split chunks and all-chunk message modules, but the test does not navigate those routes or sum the application’s eventual lazy-load graph. Authenticated and backend-dependent screens are explicitly untested. Keep the 51.6% and 30.4% figures scoped to this local controlled route and do not turn them into a whole-app or all-app claim.

## Reproduction and evidence files

Run the saved semantic checks from `/root/repos-iii/paraglide-real-apps`:

```sh
node .real-apps/anything-migration/verify-catalog.mjs
node .real-apps/anything-migration/check-trans.mjs
```

The route harness is `.real-apps/anything-migration/route-perf.mjs` relative to that repository root; it writes the latest report to `route-perf-report.json`. The saved primary report, prior cross-replicates, source/compiler pins, and module inventories are in `.real-apps/anything-migration/`. The source checkout remains at the pinned commit; the migration work and generated app are under the ignored `.real-apps/anything-migration` scratch tree.

Primary evidence: `/root/repos-iii/paraglide-real-apps/.real-apps/anything-migration/results.md`, `experiment-pin.json`, `final-module-breakdown.md`, `route-perf-report.json`, `route-perf-cross-replicates.json`, `generate.mjs`, `prepare-app.mjs`, `verify-catalog.mjs`, and `check-trans.mjs`.
