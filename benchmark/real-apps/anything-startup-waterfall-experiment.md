# AnythingLLM startup waterfall experiment

This experiment asked whether the final client-locale-split output could start its selected and base locale work earlier without changing the synchronous message API, strict `options.locale` fallback, or generated message functions. It only edits copied build artifacts under `.real-apps/anything-startup-experiments/`; no compiler or app source was changed.

The app fixture is pinned to AnythingLLM source `2a10d052a1812d7be12c43f9024072cf26a27a8b`, frozen PR4 message/runtime output generated at `4cbb10af2a36a4898112d7a57e925a6f93c49cbf`, and the app's real Vite 4 production build. The raw JSON's `compilerCommit` label remains `486153d0e953`: that later tests/config/docs commit did not change the frozen emitted message/runtime graph. The route harness starts cold browser contexts on `/onboarding`, sets browser locale `fr-FR`, disables cache, measures FCP/LCP and Brotli Q4 transfer, waits 1.5 seconds after content appears, and verifies the French route text exactly. Every reported run passed all text-parity checks. The paired summaries use conventional medians.

## Results

| Comparison | Profile | Median FCP/LCP | Transfer | Result |
| --- | --- | ---: | ---: | --- |
| Final default layout → final split layout | 80 ms RTT, 20 Mbps, 3x CPU, 10 pairs | 542 → 600 ms | 483,357 → 420,675 B | 13.0% fewer bytes, 10.7% slower paint |
| Stock split → inline locale bootstrap | 80 ms RTT, 20 Mbps, 3x CPU, 10 pairs | 614 → 520 ms | 420,675 → 420,299 B | 15.3% faster paint, effectively unchanged bytes |
| Stock split → inline locale bootstrap | 150 ms RTT, 1.6 Mbps, 4x CPU, 10 pairs | 2,150 → 2,142 ms | 420,675 → 420,299 B | 0.4% faster paint |
| Optimized native → inline Paraglide bootstrap | 80 ms RTT, 20 Mbps, 3x CPU, 10 pairs | 624 → 536 ms | 425,019 → 420,299 B | 14.1% faster paint in this app-specific bootstrap comparison |
| Optimized native → inline Paraglide bootstrap | 150 ms RTT, 1.6 Mbps, 4x CPU, 10 pairs | 2,492 → 2,326 ms | 425,019 → 420,299 B | 6.7% faster paint, below the target |
| Optimized i18next → same build with early en+fr modulepreloads | 80 ms RTT, 20 Mbps, 3x CPU, 10 pairs | 588 → 630 ms | 425,019 → 425,019 B | Early fetch hurt paint by 7.1% |
| Optimized i18next → same build with inline en+fr imports | 80 ms RTT, 20 Mbps, 3x CPU, 10 pairs | 596 → 520 ms | 425,019 → 425,019 B | 12.8% faster paint from the same app-level scheduling technique |
| Inline i18next → inline Paraglide bootstrap | 80 ms RTT, 20 Mbps, 3x CPU, 10 pairs | 542 → 534 ms | 425,019 → 420,299 B | 1.5% faster paint and 1.1% fewer bytes; no meaningful switch advantage |
| Optimized native → Vite4 split build with generated-locale preloads filtered | 80 ms RTT, 20 Mbps, 3x CPU, 10 pairs | 608 → 622 ms | 425,019 → 420,682 B | 2.3% slower paint; configured runtime behavior preserved |

Other split-only scheduling variations were inconclusive or negative: high-priority HTML preloads of the locale and registry chunks measured 624 → 648 ms (5 pairs), low-priority preloads 756 → 740 ms (5 pairs), and replacing the preload entry with the core entry measured 620 → 616 ms (5 pairs). These small-sample results do not qualify as improvements.

The inline Paraglide bootstrap chooses from the app's observed `i18nextLng` local-storage setting, then `navigator.languages`, then base `en`; it canonicalizes against the generated locale list and imports both `en` and the selected locale before the application entry runs. It leaves the generated core and message API unchanged. On the fast profile this removes the external bootstrap module and improves the split build's median by 94 ms. On the slow profile it has no meaningful effect. An FCP-text probe recorded French `h1` text before FCP in all five inline Paraglide trials; the native route showed the French heading before FCP in four of five. The probe adds a mutation observer, so its paint medians are diagnostic and are not mixed with the uninstrumented runs.

I also tested the same technique on the optimized native i18next build: a small inline module imports the already-generated English and French dictionaries before the app entry, then i18next performs its normal language detection and registration. It improved native FCP by 12.8% without adding transfer. In a direct 10-pair comparison between both inline variants, Paraglide was only 8 ms faster (1.5%) and 4,720 bytes smaller (1.1%). This explains the first apparent win as generic app-level early locale scheduling, rather than a Paraglide-specific compiler advantage.

To test a more general version, I rebuilt the app with Vite 4.5.3 `build.modulePreload.resolveDependencies` filtering explicit preload dependencies only for the generated locale chunks. The generated runtime still calls `getLocale()`, loads base plus the detected locale, validates namespaces, and uses its normal switch/fallback behavior. It did not improve the route: 622 ms versus 608 ms for optimized native. The emitted core keeps Vite's dynamic-import helper with empty dependency lists, and ESM loads the locale chunks and their registry through the normal import graph. This avenue does not qualify either.

## Interpretation and limits

The 15.3% fast-profile result against stock split output is a useful scheduling diagnostic, not a compiler optimization claim. The copied HTML selector only models this app's `localStorage` plus preferred-language order; it does not cover a configured global variable, URL strategy, custom strategy/getter, or every browser storage failure. Inline module code can also conflict with a site's Content Security Policy. The equivalent native i18next preload achieves a similar improvement, while the direct inline-vs-inline comparison is 1.5%. The Vite-native preload-dependency filter also failed to improve the route. This experiment therefore yields no qualifying compiler candidate or PR.

## Frozen artifact pins

- AnythingLLM app source: `2a10d052a1812d7be12c43f9024072cf26a27a8b`.
- Frozen PR4 message/runtime graph code generation: `4cbb10af2a36a4898112d7a57e925a6f93c49cbf`.
- Final split artifact tree: `3d1a7dc9c3eeb42afe2f7390857c39a33c22612bdc7236012732f3de21f35f6e`.
- Optimized native i18next artifact tree: `2aa0675cccb1189d3e580a7e926006e3d3af78198660c584de7e53c44527676b`.
- Paraglide inline bootstrap artifact tree: `830018be09fed6e99152063d2f39f82758e4d4b66ca2f8f963ec3552eec18fae`.
- Native inline bootstrap artifact tree: `d3e26c6a9a259d55fbab61e0d3f2c9b544049175c219f8b4d8c7ff7b23d0a187`.
- Vite preload-filter rebuild artifact tree: `837dddfb1e540152245d1174140787bdf819e92b742dc3808e948204687e9327`; rebuilt with Vite-plugin worktree HEAD `2bbb92f9266ec4420e9c96174fdeb53b9a3324df` and Vite `4.5.3`.

The frozen split output's runtime graph was generated at `4cbb10a`; the later `486153d` and `2bbb92f` changes in that worktree were tests, config validation, docs, and benchmark work that did not change that graph. The filtered Vite rebuild did use plugin source HEAD `2bbb92f`, and its distinct output tree is pinned above.

## Reproduction artifacts

- `prepare-startup-output-experiments.mjs` creates copied output variants from the frozen final split/native builds.
- `route-perf-startup.mjs` runs the actual browser route fixture with configurable artifact paths and network/CPU profile.
- `results/anything-startup-final-pr4-default-vs-split-fast-10.json`
- `results/anything-startup-final-pr4-default-vs-split-150ms-10.json`
- `results/anything-startup-inline-locale-fast-10.json`
- `results/anything-startup-inline-locale-slow-10.json`
- `results/anything-startup-inline-vs-native-fast-10.json`
- `results/anything-startup-inline-vs-native-slow-10.json`
- `results/anything-startup-native-inline-vs-native-fast-10.json`
- `results/anything-startup-inline-vs-inline-fast-10.json`
- `results/anything-startup-filtered-vs-native-fast-10.json`
- `results/anything-startup-inline-fcp-text-fast-5.json`
- `results/anything-startup-native-preload-fast-10.json`
- `results/anything-startup-preload-high-fast-5.json`
- `results/anything-startup-preload-low-fast-5.json`
- `results/anything-startup-core-bootstrap-fast-5.json`
- `prepare-native-inline-locale.mjs` creates the matched i18next early-import control.
- `vite.public.preload-filter.config.mjs.fixture` builds the Vite-native dependency-filter experiment.
- `route-perf-startup-fcp-text.mjs` captures H1 mutation timing and the visible text observed by the FCP callback.

Example invocation (from the repository root):

```sh
ANYTHING_LEFT_NAME=split \
ANYTHING_RIGHT_NAME=inline-locale-bootstrap \
ANYTHING_LEFT_DIST=.real-apps/anything-public-final-pr4-split-dist \
ANYTHING_RIGHT_DIST=.real-apps/anything-startup-experiments/split-inline-locale-bootstrap \
ANYTHING_ROUTE_TRIALS=10 \
ANYTHING_LATENCY_MS=80 \
ANYTHING_DOWNLOAD_MBPS=20 \
ANYTHING_CPU_RATE=3 \
node benchmark/real-apps/anything-migration/route-perf-startup.mjs
```
