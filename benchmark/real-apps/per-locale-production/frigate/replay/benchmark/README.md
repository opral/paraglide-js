# Frigate per-locale output A/B

This isolation compares optimized native i18next namespace loading with PR813 per-locale message-module output. Source app revision is `ff9eb8f18430198548d9c9d2cf138ed9ac7b526b`. Compiler public source is `490a5c0d0c4c44b93f61ad494b28f74987e5f245`.

The input contains all 33 original supported locales, all 29 physical namespace files, and 5,348 normalized union message IDs. Frigate config initializes 28 namespaces; `views/setup` is an additional original physical namespace. The earlier 3,039-ID prototype covered only nine namespaces. No manual key trimming is applied. `input-provenance.json` includes hashes of every original physical catalog. The generated project reads `../messages` via its original SDK sibling-path convention (`./messages/{locale}.json` relative to the directory containing the project).

`prepare.py` converts every literal string, transports braces reversibly, and produces static-import namespace facades for every physical locale. Facades preserve sparse locale key shape and original physical nesting/order. The current locale is selected through the compiler's exported `experimentalStaticLocale`. i18next's semantic engine remains in both arms; selected strings come from compiled message functions, while English and supported regional parent fallback catalogs remain lazy original JSON imports. Language changes retain the original reload behavior. This evaluates compiled output specialization, not removal of the i18next engine.

The old merged-resource adapter is invalid for full semantic parity: its preflight had 129 structural mismatches in 40,829 comparisons. The current candidate avoids merging fallback translations into the selected resource. `transport-parity.json` validates exact round-trip restoration of all 128,025 physical translated strings. This does not replace compiled-artifact or UI parity checks.

Both arms use the original locked dependencies and native Vite config, with matching ES2022 targets and normal optimization. Candidate invocation: `node benchmark/build.mjs`; native invocation from `web/`: `node node_modules/vite/bin/vite.js build --config ../benchmark/vite.native.config.ts`. `createBuilder().buildApp()` builds all 33 locale environments. Frozen original app and compiler output trees are not overwritten.

No performance result is established until static inventory, marker elimination, compiled semantic parity, and actual translated route readiness pass.

The stronger native control is `web/native-earlylocale-dist`. It initializes from the same original localStorage/system preference before loading lazy namespaces. `shared-language-helper.patch` extracts the original hierarchy into a helper shared with LanguageProvider. This is a native-control optimization, not a Paraglide compiler saving. `web/native-dist` preserves the initial earlier native timeline control separately.

SDK provenance was checked against exact official npm tarballs: all 490 installed `@inlang/sdk@4.0.0` files and all 95 installed `@lix-js/sdk@0.19.0` files match stock byte-for-byte. The SDK tarball integrity matches the compiler dependency lock. See `sdk-stock-comparison.json` and `lix-sdk-stock-comparison.json`. No dependency changes were made.

The SDK syncs arbitrary files inside `.inlang`; benchmark metadata and route maps were therefore moved to `benchmark/` rather than being included as unrelated tracked project files. All translation catalogs remain unchanged. An orchestration-requested SIGSTOP browser window crossed a stock Lix open wall-clock timer. The resulting paused-run `LIX_OPEN_TIMEOUT` is excluded from clean build-failure evidence. A fresh uninterrupted run uses the same stock guards and full inputs.

The uninterrupted full public `createBuilder().buildApp()` run passed all 33 locales. Compiled catalog inventory has 5,348 physical exports and zero missing exports; marker audit checked 53,130 emitted client JS files with zero unreplaced static markers. Exact compiled facade parity passed all 957 original sparse namespace trees. The plugin manifest records Vite 8.1.4/Rolldown 1.1.5 from the compiler package's dependency tree; the actual builder import is Frigate's Vite 8.3.3 with Rolldown 1.2.13. Host version evidence is recorded separately.

Static HTML+Live-route graph (before lazy namespace/font/media/API requests) is 1,090,525 bytes native versus 1,092,181 bytes compiled, using Brotli Q4. This is an incomplete static graph, not initial whole-page payload. The actual translated-ready probe remains the whole-page metric source.
