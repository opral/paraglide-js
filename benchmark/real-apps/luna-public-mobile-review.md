# Independent audit: final public locale-split route evidence

Reviewer: GPT-6 Luna, extra-high reasoning. I reviewed the final-source public route reports and harness. The production candidate is compiler commit `4cbb10af2a36a4898112d7a57e925a6f93c49cbf`; current head `62b73b1` changes only a test assertion. I did not launch builds or browsers. I independently recomputed the tree hashes for all three reported build directories, and each matches the JSON.

## Current-source semantic check

The focused generated-facade test passed:

```text
pnpm exec vitest run src/bundler-plugins/vite.test.ts -t 'client locale facade preserves message API and regional fallback behavior'
1 passed, 5 skipped
```

The fixture sets the active locale to `de-AT` and verifies `rich(..., { locale: null })` returns the German text. That matches the compiler-generated expression `options.locale ?? getLocale()`: `null` and `undefined` both choose the active locale. The test also retains checks for regional fallback, unknown-locale fallback, `.parts()`, getter behavior, and null options. This localized fix has no outstanding semantic issue in my review.

## Build identity and experiment method

The production builds use the app’s Vite 4.5.3 and source commit `2a10d052a1812d7be12c43f9024072cf26a27a8b`. The default Paraglide build is compared with the client-split build from the same application configuration. The slow and fast reports carry compiler commit, artifact directory, file count, output-tree hash, `index.html` hash, and `index.js` hash. I independently rehashed each output tree:

| Build | Files | Output tree SHA-256 | `index.html` SHA-256 | `index.js` SHA-256 |
| --- | ---: | --- | --- | --- |
| Default Paraglide | 257 | `4d084949bd42abd4d6f628a3f17919da2f3dd2b8d90b5c3ae91db9d5539b6292` | `1fd89e762396242280e64d3b633314f088b22cd1fb85fcc6ac00d7ea304200c5` | `4a0c27bc5af094a328fb3ad9913fb69b2b82702db176d873c9993c951a35f512` |
| Client split | 289 | `3d1a7dc9c3eeb42afe2f7390857c39a33c22612bdc7236012732f3de21f35f6e` | `9e0063405418662052e94d3821c34ba655fb2a0c10040f4b8a056513257961d7` | `39a4d7e768b375dcc9af7a008cea71c7a08ef7901655cb661166ca125f1e90ac` |

Each run alternates build order, uses a fresh Chromium 143 browser context, disables browser cache, blocks service workers, and serves Brotli Q4 responses with `cache-control: no-store`. The route is `/onboarding` in `fr-FR`; each trial waits for the heading and then a fixed 1,500 ms before sampling. The harness checks exact body text (`Bienvenue\nCommencer`) and page errors.

The reported `transferBytes` sums same-origin `PerformanceResourceTiming.transferSize` for resource entries. It includes JS chunks, CSS, fonts, images, and three mocked API responses. It excludes the HTML navigation document and external requests, so it is route subresource transfer rather than full HTML-plus-resource wire bytes. The browser uses read-only mocked onboarding/logo API responses; authenticated/backend-dependent routes, offline/service-worker behavior, and field Web Vitals are outside this experiment.

## Final-source results

The final slow-mobile report uses 10 paired trials at 150 ms RTT, 1.6 Mbps down, 2 Mbps up, and 4x CPU throttling. Median FCP/LCP is 2,478 ms for default and 2,144 ms for split, a 334 ms / 13.5% reduction. Every paired FCP observation favors split, by 300–372 ms. Median counted route subresource transfer is 483,357 B to 420,675 B, a reduction of 62,682 B / 12.97%. The JS entries account for that reduction; CSS, fonts, images, and API fixture bytes match. All 10 pairs have exact body-text parity and no page errors.

The same artifacts were tested at 80 ms RTT, 20 Mbps down, 2 Mbps up, and 3x CPU, again for 10 pairs. Transfer remains 483,357 B to 420,675 B, but median FCP/LCP is 540 ms default versus 614 ms split, a 74 ms / 13.7% regression. Split is slower in all 10 paired observations. This is a clear counterexample to a universal page-load-speed claim: the experiment supports lower shipped route subresource bytes, and faster FCP on the constrained profile, while this fast-network profile pays startup overhead.

The separate native eager-i18next metadata control uses the slow-mobile profile and 5 pairs. It reports median FCP/LCP 4,992 ms to 2,124 ms (−57.5%) and counted route subresource transfer 1,004,417 B to 420,675 B (−58.1%). Every paired FCP result favors split; all five render the same text with no page errors. The native control output is also hash-pinned in `anything-final-mobile-native-vs-split.json`. Treat this as one route and one native eager-control build, not an estimate for all i18next apps.

The final JSONs are `results/anything-final-mobile-4g-repeat.json`, `results/anything-final-fast-repeat.json`, and `results/anything-final-mobile-native-vs-split.json`. Each records conventional even-sample medians and artifact identities. This final-source evidence clears the >10% route-transfer gate against the default Paraglide build on the tested real catalog and route. It also clears that byte gate against the native eager control. It does not show a 10% FCP gain on every network: the 20 Mbps result regresses FCP. Keep conclusions scoped to this route, catalog, and test profiles; do not state a whole-app average or a universal startup improvement. The indexed payload change by itself was previously measured at only 2.7% incremental route-transfer savings over the preceding split candidate, so the qualifying comparison is the combined feature versus the default output.

## Final guard and suite

Commit `a602364` rejects a second split-enabled Paraglide plugin in the same resolved Vite config because the plugin instances share virtual module IDs. This config-time guard does not alter the emitted message/runtime graph measured at `4cbb10af`; the final-source artifact hashes above remain applicable. The final suite log reports 641 passed and 5 skipped across 57 files. The one-test increase from the earlier 640-pass count is the unminified-cache regression added with the correctness fix.

## Unminified client-split compiler fix

The follow-up fix keeps client split metadata enabled when Vite sets `build.minify: false`, while leaving generated locale helper names in their normal debug form. In `configResolved`, Vite explicitly sets `enableLocaleFunctionNames = false` for this build mode; the expanded compiler dispatch now still uses the private Vite compilation path whenever client splitting is active. I independently reviewed the dispatch and metadata path. The focused cold Vite test passed for both `minify=undefined` and `minify=false` (2 passed), confirming the unminified build still emits the metadata and locale chunks. This is a compiler correctness fix only; it does not change the default minified production codegen measured above. I did not rebuild or claim a new artifact hash for this fix.

The persistent-cache reader now rejects client-split entries missing either `client-locale-split.json` or `locale-loader.js`, which prevents a cache written by the previous broken unminified path from restoring incomplete output. I reviewed the guard and the regression setup: it removes both output hashes and files from the old cache/output, then uses a fresh filesystem identity to simulate a process restart and confirms the metadata is regenerated. The full suite passed 641 tests with 5 skipped across 57 files, including TypeScript checking. The guard affects cache acceptance only; it does not change generated minified code or the measured production graph.
