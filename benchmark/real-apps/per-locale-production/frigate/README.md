# Frigate: full-catalog per-locale production comparison

Pinned app `ff9eb8f18430198548d9c9d2cf138ed9ac7b526b`; public compiler PR813 commit `490a5c0d0c4c44b93f61ad494b28f74987e5f245`. Actual host: Node22.23.2, Vite8.3.3, Rolldown1.2.13. All 33 supported locales, 29 physical namespaces, 5348 union exports and 128025 original strings remain inputs. Exact sparse resources pass all 957 locale/namespace comparisons. i18next/react-i18next remain to interpret the original message syntax, plural/context/Trans and fallback semantics. This is a compiled-resource comparison, not an engine-free migration.

The final adapter gives each namespace one lazy module with automatically generated sparse locale branches selected by the static locale. Normal Vite folds unused branches. No route keys are manually chosen. The original per-locale/namespace-entry layout created excessive shared-message request fan-out; its frozen negative results remain in `first-ui-pair-summary.json`. Historical descriptions in `replay/benchmark/report.md` and `README.md` describe that first layout; this file and `repeated-summary.json` describe the completed grouped experiment.

| Five-pair median | Optimized native | Grouped compiled | Change |
| --- | ---: | ---: | ---: |
| Desktop French controls ready | 1833.8ms | 2538.4ms | 38.4% slower |
| Mobile French controls ready | 9986.6ms | 7809.8ms | 21.8% faster |
| Desktop observed initial encoded bodies | 1434635B | 1464977B | 2.12% more |
| Mobile observed initial encoded bodies | 1212165B | 1241713B | 2.44% more |
| Desktop initial requests | 73 | 71 | 2 fewer |
| Mobile initial requests | 67 | 65 | 2 fewer |

There is substantial variation: native mobile readiness ranges7758.4–10035.4ms, candidate7791.7–7827.6ms. Three pairs favor the candidate; two are near ties with small regressions. Desktop has three regressions and two near ties. All20 captures are retained, with no exclusions, missing initial response bodies, page errors or failed requests. All10 paired screenshot comparisons are byte-identical. These laboratory route results do not establish a universal speedup.

Body accounting includes HTML and every request begun by translated readiness, waited through completion. Observed encoded bytes above differ from normalized Q4, which also recompresses mocked API text: normalized desktop1405544→1435886B, mobile1183066→1212614B. The tests use identical original E2E API/WebSocket/media fixtures and do not measure real camera streaming. Desktop profile80ms/20Mbps/3xCPU; mobile150ms/1.6Mbps/4xCPU; fresh contexts/cache disabled.

The native control chooses the original stored/system language before initialization and retains lazy namespace/English/regional fallback loading. Candidate selected resources remain sparse, with separate original fallback catalogs. Builds use original locked dependencies, target and optimization. Stock SDK/Lix files match exact npm tarballs; no SDK limits or timers were modified. A previously paused run is excluded as an orchestration failure, and both full builds passed uninterrupted.

Language switching requires mapping the preference to the matching emitted locale entry. The existing picker writes localStorage and reloads the same URL; that alone cannot change a fixed-locale artifact. The benchmark directly selects French and does not validate picker behavior. [Luna static review](luna-single-layout-review.md) records this integration caveat.

Replay sources, original catalogs, metadata, generators, production configs, patches, build logs, request captures and screenshots are in `replay/`. Prepare that directory from a fresh pinned checkout and the verified compiler entry:

```sh
FRIGATE_CHECKOUT=/path/to/pinned-frigate PARAGLIDE_COMPILER_ENTRY=/path/to/compiler/dist/index.js node replay/setup-replay.mjs
cd replay/web
npm ci
cd ..
python3 benchmark/prepare.py
python3 benchmark/prepare-single-namespace.py
cd web
node node_modules/vite/bin/vite.js build --config ../benchmark/vite.native-earlylocale.config.ts
cd ..
node benchmark/build-single.mjs
```

Setup validates the pinned app revision and critical compiler hashes, restores source overrides/original catalogs, and rewrites the compiler import to the supplied entry. After building, start `node benchmark/serve.mjs web/native-earlylocale-dist 4197` and `node benchmark/serve.mjs web/candidate-single-dist/__paraglide/fr-6672 4198` in separate terminals. With the captured Chromium runtime installed, run `node benchmark/repeat-pairs.mjs`. The probe config and runner preserve the exact fixture/capture behavior. Frozen full output trees remain local and are not committed.

Machine-readable results: [repeated-summary.json](repeated-summary.json). Full input/build/compiled inventories and manifests preserve provenance for both layouts.
