# LibreChat: engine-free per-locale output versus optimized i18next

The French production app runs without i18next or react-i18next modules in any emitted chunk. Against the optimized native control, this first pair is effectively tied: login readiness 1798→1792 ms desktop and 12140→12075 ms mobile. Completed initial HTTP body bytes are 2,278,673→2,269,724 (-0.393%). Static initial JavaScript Brotli-Q4 bytes are 2,067,800→2,060,342 (-0.361%). No profile reached the >10% repeat gate; these single pairs establish runnable parity and a negative qualification result, not a statistically established speedup.

The actual public `/forgot-password` route also renders identical French text and input attributes: desktop 1730→1713 ms. It is not a lazy route. Authenticated lazy-route UI was not exercised by the read-only unauthenticated fixture. The complete French artifact, including emitted lazy chunks, passes the module-ID engine-absence audit (7,771 module IDs, zero forbidden native-engine package files).

## Input and migration scope

Native app commit: `e1dfc10449ff713faffacd60273fddcfe2c0a698`. All 41 native catalogs, 50,209 physical strings and 3,516 union message exports are retained; no route-key trimming. Catalog shapes are sparse, flat strings in one `translation` namespace. The adapter preserves exact-locale/base/English fallback and native plural/key/default/interpolation behavior on the tested surface. Original English fallback is represented by compiled English functions. Locale changes use full document reload and require the server to select the matching artifact; only French was emitted for this negative first-pair test. The build script supports all41 by omitting `LIBRECHAT_BUILD_LOCALES`.

This integration reuses public PR813 compiler output from `490a5c0d0c4c44b93f61ad494b28f74987e5f245`. It does not claim a fresh latest-main compiler/SDK run. The prior full-input compilation and its converter provenance are in `../../per-locale-production/librechat`; frozen local paths are in `LOCAL-ARTIFACTS.json`. `derive-exports.mjs` adds export aliases to the original compiled locale function declarations, leaving their bodies unchanged. It automatically generates all41 physical-key-only resource facades. Original and derived SHA256 values for all3516 modules are recorded; no SDK/Lix implementation or timeout patches are used in this integration. Vite's stock frozen per-locale environment helper performs actual `createBuilder().buildApp()` environment builds.

`semantic-parity.json` passes 186,433 native-i18next oracle comparisons across all41 catalogs, all compiled physical strings, English fallback, interpolation, plurals, unknown keys, key arrays and defaults. `trans-parity.json` passes 1,476 comparisons across the four actual named-component key variants/all41 locales/nine ordinary and hostile title values. The app has eight actual JSX Trans sites. The installed native Trans parser consumes markup in explicitly interpolated values, so matching it requires native parser behavior; the standalone `html-parse-stringify@3.0.1` package supplies tokenization without importing either engine. Tests also retain component href/class/rel/onClick behavior. No claim is made for arbitrary i18next plugins, ICU, multiple namespaces or unused third-party APIs.

App-source TypeScript passes (`typecheck-app.log`). Full native-test TypeScript retains two test-only provider structural-type diagnostics (`typecheck.log`): the compatibility runtime does not pretend to implement all native provider internals. The independent source review is `luna-enginefree-review.md`; hook readiness/Suspense is source-audited rather than comprehensively integration-tested, and unused `exists` is outside the aggregate oracle.

## Browser/body protocol

Playwright1.64.0 uses the same explicit Chrome156.0.8078.4 binary for both arms. Each fresh context blocks service workers and disables cache. Desktop uses80ms/20Mbps/3×CPU, mobile150ms/1.6Mbps/4×CPU. The same read-only canned backend serves both arms, and all labels/inputs/page errors/failed requests are captured. Brotli-Q4 files are precomputed before browser timing. No body hashing occurs before translated readiness.

All ordinary HTTP requests started before translated readiness are awaited to completion, including navigation bodies. Chrome leaves a hidden `silence.mp3` audio document request open in both arms; its actual Range media request finishes and is counted once. The separate pending bootstrap response declares36,494 bytes. Exact whole-request totals are therefore bounds, not invented completion: native2,278,673..2,315,167 and candidate2,269,724..2,306,218 bytes on both login profiles. CDP received-at-ready media counters are retained as diagnostics and are not used as a metric. See raw captures for URLs, status, Content-Length, Range and end states. Forgot-password bounds are native2,498,132..2,534,626 and candidate2,489,183..2,525,677 bytes.

## Replay

`source/` and `enginefree.patch` contain the exact adapter, Vite aliases/module audit, build entrypoint, parser dependency declaration/lock change and app-source typecheck configuration. Apply the patch to an isolated copy of the frozen optimized-native source; retain its original package/frontend dependencies and immutable public assets. Copy top-level replay scripts/counts/metadata into that copy. Do not install a different toolchain over the frozen dependencies. Copy the prior complete generated `src/paraglide` source, then regenerate aliases/facades:

```sh
export LC_NODE=/root/.npm/_npx/387698761821791d/node_modules/node/bin/node
export FROZEN_PARAGLIDE_DIR=/root/repos-iii/librechat-per-locale-ab/client/src/paraglide
"$LC_NODE" derive-exports.mjs
"$LC_NODE" semantic-parity.mjs
"$LC_NODE" trans-parity.mjs
cd client
"$LC_NODE" node_modules/typescript/bin/tsc --noEmit --project tsconfig.enginefree.json
LIBRECHAT_BUILD_LOCALES=fr NODE_OPTIONS=--max-old-space-size=12288 "$LC_NODE" build-enginefree.mjs
cd ..
"$LC_NODE" compress-q4.mjs client/dist-enginefree
"$LC_NODE" graph.mjs
```

The config's frozen compiler helper import, graph/compression scripts and fixture defaults contain the recorded local artifact paths. Relocate those explicit paths together when replaying on another host; the derive script accepts `FROZEN_PARAGLIDE_DIR`. All needed original full-catalog conversion/compiler sources remain in the prior replay package/local artifact manifest rather than duplicating large generated trees here. Node24.21.0 and Vite8.2.2 must match both arms; preserve native target/manualChunks optimization.

Run `serve.cjs` with `LIBRECHAT_DIST_ROOT` set to the frozen native output and `PORT=4188`, and the same fixture with `LIBRECHAT_DIST_ROOT` set to the new per-locale output root, `PER_LOCALE=1`, `PORT=4190`. Use the probe's explicit `PLAYWRIGHT_MODULE`, `CHROMIUM_PATH`, `ORIGIN`, `OUTPUT_FILE` and `PROFILE`; `probe-public.mjs` additionally accepts `ROUTE_PATH=/forgot-password` and `READY_TEXT='Réinitialiser votre mot de passe'`. Probes set French locale and make no real authentication writes. See their source for exact configuration and body-accounting guards.

Full isolated source and outputs remain in `/root/repos-iii/librechat-enginefree-ab`; no generated source/dist tree is committed in this compact evidence package. `comparison-summary.json` records metrics and scope; `PACKAGE-SHA256.json` hashes compact evidence files only.
