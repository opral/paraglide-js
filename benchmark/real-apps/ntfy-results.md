# ntfy optimized-i18next route control

This is a negative production-route control for the compiler campaign. It compares the app's existing optimized HTTP-backed i18next setup with an app-local Paraglide adapter and the Vite client locale-split prototype. The split build passes route parity, but it does not meet the campaign's 10% user-facing gate.

## Pinned inputs

- App: `binwiederhier/ntfy`, commit `211ba22860d7483073a8ce13dcda5f467194989b`.
- Lockfile SHA-256: `e61d56df38335cffa478cd84b2801fc1124379ed4043e4a373f15eaeaebc2e7d`.
- Runtime used: Node `v22.23.2`, i18next `26.4.2`, react-i18next `17.0.15`, Vite `8.3.4`.
- Compiler benchmark worktree: `5d51e7a88275f1774eb23e547509829a4fa48437`.
- Client locale-split plugin source used for the measured candidate: `7cb638f5dbbbadf1b54ed500bb99e76206f5ccbb`. The current checkout later gained an unminified-output metadata fix; the route report records the measured source pin.
- Native i18next setup loads `/static/langs/{{lng}}.json` over `i18next-http-backend`, detects the language with `i18next-browser-languagedetector`, and falls back to English. The native source has `debug: true`; the baseline retained its shipped config and dependencies.

The replay app lives in an isolated checkout at `/root/repos-iii/ntfy-native-ab`. The source repo is untouched. The Paraglide compatibility adapter and generated catalogs are benchmark scaffolding, not a supported migration API.

The measured browser artifacts are preserved at `/root/repos-iii/paraglide-ntfy-ab-worktree/.real-apps/ntfy-ab/native-build` and `/root/repos-iii/ntfy-native-ab/benchmark-output/paraglide-split`. Their canonical tree SHA-256 values are recorded in `.real-apps/ntfy-ab/artifact-manifest.json`; the hash covers sorted `relativePath\0fileSize\0fileSHA256\n` records. A rebuild from the current plugin checkout at `e293fe7` produced byte-identical split output, confirmed with `diff -qr`, to the preserved measured candidate.

## Parity and build checks

The generated catalog has 484 native keys represented by 473 message IDs across 51 locales. The harness compared 25,143 calls, including plural counts 0, 1, 3, 5, and 100, with zero mismatches. Unknown locale fallback and named rich `<Trans>` markup also pass. The app's existing `src/app/i18n.test.js` passes through the adapter: 1 test file, 4 tests.

The default all-locale Paraglide build produces a 2,603,014-byte main entry, above the app's unchanged 2 MiB Workbox per-asset precache limit; Workbox excludes that entry. The locale-split candidate builds and precaches 51 per-locale chunks. Browser measurements block service workers and disable cache for both builds, so they represent first-route cold network behavior, not install or offline behavior.

## Production route result

The browser harness loads `/login` with a French local-storage preference. It waits until the splash screen is gone and the visible login form has French title, password, and submit labels plus the native English fallback for “Username or email.” All ten trials in both arms pass the visible-text/parity check with no page errors.

| Median, 10 alternating fresh-context pairs | Optimized i18next | Paraglide locale split | Change |
| --- | ---: | ---: | ---: |
| Time to translated, usable login | 1,432 ms | 1,431 ms | 0.07% faster |
| Requested Brotli-encoded route bytes | 383,115 B | 377,441 B | 1.48% fewer |
| Decoded route bytes | 1,192,768 B | 1,206,155 B | 1.12% more |
| Long-task time | 177.5 ms | 153 ms | 13.8% lower |
| FCP / LCP | 196 ms | 280 ms | 42.9% later |

The app imposes a 1,000 ms minimum splash duration, followed by fades. FCP and LCP observe the static splash rather than translated controls, so they are not useful gate metrics here. Readiness reflects the actual visible translated form; the splash floor means this route cannot convert the current JS/startup differences into a meaningful readiness win. Long-task time is secondary and does not clear the route bytes or readiness gate. This result does not qualify for a compiler PR claiming a user-facing improvement.

### Same-target native control

The locale-split build requires `esnext` for top-level await, while the app's normal Vite build uses its default target. I built native i18next again from the same pinned source, changing only `build.target` to `esnext`, and ran one paired route check. It produced the same native request graph and exact same route bytes as the default-target capture: 14 resources, 383,115 encoded bytes, and 1,192,768 decoded bytes. SHA-256 checks of the requested bodies found zero differences across all 14 resources. Against this control, Paraglide requested 377,441 encoded bytes and became ready in 1,416 ms versus 1,413 ms for native. The target mismatch does not explain the negative result; because the request graph and bytes are unchanged, the check was not expanded to ten trials.

### Why the entry shrink barely changes the route

The candidate entry is 82,005 B smaller when Brotli-compressed (260,263 B native vs 178,258 B candidate), but the initial route also requests new locale-split assets. The selected French and English translations shrink from 18,235 B native JSON to 13,352 B generated locale chunks, a 26.8% localization-payload reduction. The candidate adds a 3,697 B split runtime, a 76,906 B `Close` chunk, and small preload/registry assets. The `Close` chunk is parser-initiated and is a dependency in the output's lazy EmojiPicker module graph; it arrives in the measured initial request graph. Together these assets absorb almost all the main-entry reduction, leaving 5,674 B (1.48%) fewer encoded bytes for the whole route. Fonts, app CSS, shared utility code, the Workbox window, and the rest of the app account for most remaining bytes.

This distinction is why catalog compression or entry-size changes alone are not treated as product wins. The gate uses requested route bytes and time to visible translated controls.

### Sparse equal-to-base prototype

I also tested a Vite-only prototype that stores a selected locale's static string as `undefined` when it exactly equals English, then materializes those slots from the already-loaded English array once during locale loading. Dynamic message functions remain intact. This is a benchmark transform with fail-closed source-shape checks, not a compiler change or supported API.

The emitted arrays contain 51 locales × 473 message slots. After filling the sparse slots from the base array, all 24,123 locale/message cells match the ordinary locale-split output, including every dynamic function body; 9,710 slots were omitted across all non-base locales. French omits 24 static strings (367 raw UTF-8 bytes). The browser smoke reaches the same visible French login UI with no errors.

This does not improve the measured route. The original split candidate requested 377,441 Brotli-Q4 bytes over 18 resources in the ten-pair run. The sparse smoke requested 377,434 bytes, a 7-byte reduction from that candidate (0.002%); selected-locale savings are nearly canceled by the extra base-materialization logic. Route readiness was checked for parity only in this one-pair smoke and is not presented as a performance result.

The tradeoff is better when considering every locale: the 51 emitted locale modules shrink from 1,322,499 to 1,097,060 raw bytes and from 348,927 to 254,070 Brotli-Q4 bytes (94,857 fewer compressed bytes across the complete locale set). The app's generated Workbox precache similarly falls by about 220 KiB of uncompressed assets, from 123 entries / 3,938.20 KiB to 123 entries / 3,718.41 KiB, after excluding the 800-byte runtime `config.js`. This is a whole-catalog/precache saving, not a first-route saving; it remains below the campaign's 10% user-facing gate for this app.

The follow-up candidate output tree is `/root/repos-iii/ntfy-native-ab/benchmark-output/paraglide-sparse-static`; its SHA-256 tree fingerprint is `27554774bbabc9e6d81248ac213115d7796bb8f8eaf3d9f64c17d40a05f3c367`. The measured split candidate tree remains `08b586f29af54810efb12b0c677b10cbb44046bff71f2769378b5580f97e2434`. The one-pair smoke and per-cell parity results are stored under `.real-apps/ntfy-ab/sparse-static-*.json`.

## Reproduction

Use Node 22 and a clean app checkout at the pinned commit. The native build must be captured before applying the benchmark adapter:

```sh
git clone https://github.com/binwiederhier/ntfy.git ntfy-native-ab
git -C ntfy-native-ab checkout 211ba22860d7483073a8ce13dcda5f467194989b
cd ntfy-native-ab/web
npm ci
npm run build
mkdir -p /path/to/paraglide-ntfy-ab-worktree/.real-apps/ntfy-ab/native-build
cp -a dist/. /path/to/paraglide-ntfy-ab-worktree/.real-apps/ntfy-ab/native-build/
```

The Paraglide/compiler plugin checkout used for the measured build is pinned above. Set `PARAGLIDE_REPO_ROOT` to that checkout and `PARAGLIDE_PLUGIN_MODULE` to its built `dist/index.js`:

```sh
export NTFY_WEB_ROOT=/path/to/ntfy-native-ab/web
export NTFY_BENCHMARK_OUTPUT_ROOT=/path/to/paraglide-ntfy-ab-worktree/.real-apps/ntfy-ab
export PARAGLIDE_REPO_ROOT=/path/to/paraglide-client-split-pr4
export PARAGLIDE_PLUGIN_MODULE=$PARAGLIDE_REPO_ROOT/dist/index.js
node benchmark/real-apps/migrate-ntfy.mjs

NTFY_LOCALE_SPLIT=1 NTFY_BUILD_NAME=paraglide-split \
  npx vite build --config vite.paraglide.config.mjs
NTFY_BENCHMARK_OUTPUT_ROOT=$NTFY_BENCHMARK_OUTPUT_ROOT \
  node /path/to/paraglide-ntfy-ab-worktree/benchmark/real-apps/ntfy-semantic-parity.mjs "$NTFY_WEB_ROOT"
npx vitest run --config vitest.paraglide.config.mjs src/app/i18n.test.js
TRIAL_COUNT=10 node /path/to/paraglide-ntfy-ab-worktree/benchmark/real-apps/ntfy-browser-ab.mjs \
  /path/to/paraglide-ntfy-ab-worktree/.real-apps/ntfy-ab/native-build \
  /path/to/ntfy-native-ab/benchmark-output/paraglide-split \
  /path/to/paraglide-ntfy-ab-worktree/.real-apps/ntfy-ab/ntfy-paraglide-ab.json
```

To reproduce the sparse follow-up after this setup, add `NTFY_SPARSE_STATIC_FALLBACK=1` and use a distinct output name. Then compare the emitted arrays after base-locale materialization and run a one-pair French route smoke:

```sh
NTFY_LOCALE_SPLIT=1 NTFY_SPARSE_STATIC_FALLBACK=1 NTFY_BUILD_NAME=paraglide-sparse-static \
  npx vite build --config vite.paraglide.config.mjs
node /path/to/paraglide-ntfy-ab-worktree/benchmark/real-apps/ntfy-sparse-static-parity.mjs \
  "$NTFY_WEB_ROOT/src/paraglide/client-locale-split.json" \
  /path/to/ntfy-native-ab/benchmark-output/paraglide-split \
  /path/to/ntfy-native-ab/benchmark-output/paraglide-sparse-static \
  "$NTFY_BENCHMARK_OUTPUT_ROOT/sparse-static-semantic-parity.json"
TRIAL_COUNT=1 node /path/to/paraglide-ntfy-ab-worktree/benchmark/real-apps/ntfy-browser-ab.mjs \
  "$NTFY_BENCHMARK_OUTPUT_ROOT/native-build" \
  /path/to/ntfy-native-ab/benchmark-output/paraglide-sparse-static \
  "$NTFY_BENCHMARK_OUTPUT_ROOT/sparse-static-smoke.json"
```

The browser runner needs Playwright. Set `PLAYWRIGHT_MODULE` to the campaign's installed `playwright/index.mjs` if it is not available at the script's default local path. `ntfy-artifact-manifest.mjs` records file-tree SHA-256 values and adds them to the A/B JSON without changing its trial metrics.

```sh
node benchmark/real-apps/ntfy-artifact-manifest.mjs \
  "$NTFY_WEB_ROOT" \
  "$NTFY_BENCHMARK_OUTPUT_ROOT/native-build" \
  /path/to/ntfy-native-ab/benchmark-output/paraglide-split \
  "$NTFY_BENCHMARK_OUTPUT_ROOT/artifact-manifest.json" \
  "$NTFY_BENCHMARK_OUTPUT_ROOT/ntfy-paraglide-ab.json"
```

## Scope limits

This is `/login`, not every notification, settings, and account flow. The adapter rewrites static literal calls and supplies a complete generated lookup for dynamic keys and `Trans`; its React hook deliberately tracks locale changes. API and external traffic are blocked by the browser harness. The native PWA precaches all original locale JSON; the candidate split precaches all generated locale chunks. Neither offline behavior nor repeat-visit caching is measured. No compiler/product optimization is qualified by this result.

## Artifacts

- Harness: `ntfy-browser-ab.mjs`.
- Catalog generation and compatibility adapter: `prepare-ntfy.mjs`, `ntfy-support/`.
- One-command isolated setup: `migrate-ntfy.mjs`.
- Semantic parity: `ntfy-semantic-parity.mjs`; sparse-output parity: `ntfy-sparse-static-parity.mjs`.
- Output tree provenance: `ntfy-artifact-manifest.mjs` and `.real-apps/ntfy-ab/artifact-manifest.json`.
- Full route trials: `.real-apps/ntfy-ab/ntfy-paraglide-ab.json`.
- Same-target esnext check: `.real-apps/ntfy-ab/native-esnext-vs-split.json`.
- Committed raw evidence: `results/ntfy/` contains the A/B trials, both artifact manifests, semantic parity outputs, and sparse-route smoke.
