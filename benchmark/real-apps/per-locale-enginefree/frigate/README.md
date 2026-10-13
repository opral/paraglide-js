# Frigate: engine-free French Live route

This first matched pair did not reproduce LocalAI's favorable result. Both actual Frigate Live pages passed French title/control checks with zero unexpected browser errors. Screenshots were byte-identical within each profile. Neither profile qualified for the favorable >10% repeat gate, so these four captures remain diagnostic first-pair results, not medians.

| Profile | Native ready | Engine-free ready | Change | Native initial observed body | Engine-free body | Change |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Desktop | 1,845.3 ms | 2,037.3 ms | +10.4% | 1,434,635 B | 1,448,010 B | +0.93% |
| Mobile | 9,988.8 ms | 10,061.8 ms | +0.73% | 1,212,165 B | 1,224,749 B | +1.04% |

Normalized Brotli Q4 whole initial bodies were 1,405,545 → 1,418,919 B desktop (+0.95%) and 1,183,066 → 1,195,650 B mobile (+1.06%). Request counts stayed 73 and 67. Both methods include HTML, assets, fonts and mocked API/media requests begun before the translated-control readiness barrier, drained to completion. No response bodies were unavailable. The observed method uses navigation and resource encodedBodySize; normalization recompresses decoded text at Q4 and leaves binary bodies unchanged.

The profiles are desktop 80 ms/20 Mbps/3× CPU and mobile 150 ms/1.6 Mbps/4× CPU. Fresh contexts, no-store responses, identical upstream canned API/WebSocket/media fixtures, `/#front_door`, and stored French selection were used. No action was taken before readiness. Camera content is the existing fixture, not a real camera stream.

## What changed and what this proves

The candidate removes the installed **i18next and react-i18next runtimes completely** from every emitted JS chunk. `benchmark/emitted-module-ids-fr.json` records 8,756 emitted module IDs and zero native translation package modules. This is a custom fixed-locale compatibility runtime exposed through import aliases, not a whole-app rewrite to direct `m.*()` calls. It consumes compiled selected-locale resource suppliers, keeps original sparse key shapes, and lazily loads original English/regional fallback resources separately. All source catalogs and all 33 source locale branches were retained: 29 namespaces, 5,348 union message IDs, and 128,025 physical strings. Only the measured French production artifact was emitted in this experiment.

Normal app Vite 8.3.3/Rolldown 1.2.13 optimization, ES2022 target, original inputs/keepNames and no manualChunks were used. Unchanged public PR813 compiled message modules from commit `490a5c0d0c4c44b93f61ad494b28f74987e5f245` were reused. `globalThis.__PARAGLIDE_STATIC_LOCALE__` was defined as `fr` for this normal Vite build. No SDK invocation, dependency edits, compiler-function rewrites, row-limit changes, or compiler build-speed claim occurred. The stock SDK proof and frozen full-input compiler provenance are referenced and copied into `benchmark/`.

Native uses the previously frozen early-locale, lazy objects/audio namespace baseline. Its requested initial entry initializes using the original stored/system preference helper. The artifact also contains an original initializer in an **unrequested other lazy route**; this does not execute in either measured Live capture. Other native routes are not certified as equally optimized by this experiment.

## Semantic coverage and limits

`semantic-parity.json` records 490,245 native comparisons with zero failures, across all 33 locales: catalog leaves, interpolation, cardinal counts, exists, first-level object returns, sparse locale/fallback precedence, missing/default/key-array paths, synthetic context/count precedence, explicit literal dotted keys and fixed-T key prefixes. `compiled-single-parity.json` separately records all 957 compiled namespace trees matching their original raw trees. The suppliers reused here are byte-identical to those frozen suppliers.

`trans-parity.json` records 1,255 real catalog markup render comparisons against native Trans with zero differences. `trans-dynamic-parity.json` repeats those cases with hostile explicit interpolation values and also passes 1,255 comparisons. Frigate's missing-key handler intentionally overrides native supplied default values; this was included in the oracle. The React hook binds the first namespace by default, matching native, with explicit nsMode=fallback support.

A bounded source oracle, `trans-source-parity.json`, also passes 164 comparisons: 78 static Trans call sites in English and French, including 144 child-literal-key checks, plus eight synthetic numeric/nested React-child, hostile child-derived interpolation and count/context checks. Its TypeScript AST inventory found 80 actual Trans JSX sites; two dynamic-key sites are explicitly skipped. Event-handler behavior is not interactively certified. Direct global `t(..., {keyPrefix})` is outside the app surface and differs from native (native ignores that option; this adapter applies it). The fixed-T prefix API used in the oracle matches native.

These checks and the Live screenshots do not certify every dialog, React hook lifecycle or arbitrary i18next API. No full-app correctness claim is made. See `benchmark/luna-enginefree-review.md` for the independent scope review. Existing language selection stores localStorage and reloads the current URL; deployment must select the corresponding locale artifact externally. Language switching and other locale artifacts were not measured or certified.

## Replay

This package's base is `benchmark/real-apps/per-locale-enginefree/frigate` relative to the benchmark repository. The adjacent `../../per-locale-production/frigate/replay` package supplies the complete original catalogs, converter, metadata, hidden `.inlang` project settings, lockfile and pinned upstream fixtures. They are intentionally referenced instead of duplicated. The old package's compiler-generation commands can regenerate the complete frozen message-module source using pinned public PR813; alternatively provide that unchanged compiled source directly.

From this package directory, prepare an isolated target with a clean Frigate checkout at `ff9eb8f18430198548d9c9d2cf138ed9ac7b526b`:

```sh
FRIGATE_ENGINEFREE_WORKDIR=/path/to/isolated-enginefree \
FRIGATE_CHECKOUT=/path/to/pinned-frigate \
PARAGLIDE_COMPILED_SOURCE=/path/to/full-public813-paraglide-source \
node benchmark/replay-setup.mjs
cd /path/to/isolated-enginefree/web
npm ci
node ../benchmark/parity.mjs
node ../benchmark/trans-parity.mjs
node ../benchmark/trans-dynamic-parity.mjs
node ../benchmark/trans-source-parity.mjs
FRIGATE_BUILD_LOCALE=fr node node_modules/vite/bin/vite.js build --config ../benchmark/vite.enginefree.config.ts
```

`generate-namespaces.py` regenerates the exact selected-resource suppliers from full catalogs/metadata and the archived loader table. The engine-free setup copies its source overrides after the shared original overrides. The pinned app patch-package patches and lockfile remain present.

Recreate the native control separately using the adjacent production replay's `vite.native-earlylocale.config.ts` and native source, not the engine-free source overrides. Serve native and engine-free builds with `node benchmark/serve.mjs /path/to/dist 4197` and port `4198`. In the engine-free replay's `web` directory, run the probe for each arm:

```sh
E2E_STRICT_ERRORS=1 FRIGATE_PROBE_PORT=4197 \
NAMESPACE_GRAPH_OUTPUT=/path/to/results/native \
FRIGATE_PROBE_REPORT=/path/to/results/native-report.json \
node node_modules/@playwright/test/cli.js test --config ../benchmark/probe.config.ts
```

Use port 4198 and distinct output paths for the candidate. No external services are required; the pinned E2E fixture intercepts backend traffic. The four archived raw captures, screenshots, report files, build log and module IDs remain in `benchmark/`. `provenance.json` records the frozen source reference, representative source hashes, full-input counts and host versions.
