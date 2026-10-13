# LibreChat PR813 per-locale compiled-resource control

Pinned LibreChat e1dfc10449ff713faffacd60273fddcfe2c0a698, original package-lock and client package.json, Vite 8.2.2. Frozen public compiler 490a5c0d0c4c44b93f61ad494b28f74987e5f245 copied into compiler/dist. Compiler Vite dependency points to the same native app Vite version. Node 24.21.0 builds both new outputs.

This is an **engine-retaining compiled-resource control**, not an engine-free migration. All 41 original catalogs are converter inputs: 3516 union keys; EN3407, FR1492; original bo/bs/sk/ug catalogs are empty. The converter escapes every backslash and brace so message-format strings represent original i18next strings literally. The original i18next/react-i18next engines still interpret interpolation, plural/context suffixes, unknown-key fallback and Trans markup. Original static EN fallback remains present. The final candidate uses automatically generated per-locale factories that statically import every original key physically present in that locale. Vite folds the public static locale marker and prunes unused imports. No route keys are manually selected. The first reflection experiment pins all 3516 functions and is retained separately in dist-per-locale and initial-graph-reflection.json.

Candidate build uses real Vite createBuilder().buildApp(), experimentalPerLocaleBuild and outputStructure message-modules, preserving original optimized native build target and chunk groups. Each locale change performs document reload to choose its static graph. This changes the original in-app language-switch behavior to the compiler's required document-navigation model.

Reproduction:

```sh
node convert.mjs
bash build.sh
LIBRECHAT_DIST_ROOT="$PWD/native-source/client/dist-native" PORT=4188 node serve.cjs
LIBRECHAT_DIST_ROOT="$PWD/client/dist-per-locale-facades" PER_LOCALE=1 PORT=4189 node serve.cjs
```

Fixtures preserve the supplied native read-only canned startup/config/unauthenticated responses. No real login or external APIs are exercised. All converted JSON catalogs live in client/messages, outside the managed project.inlang folder, with pathPattern ./messages/{locale}.json resolved from its parent. Both output trees receive precomputed Brotli Q4 sidecars before any browser timing.

Verification outputs: catalog-counts.json, output-verification.json (all locale build manifest and export counts), literal-parity.json (every locale's original strings and English fallback checked against compiled functions), initial-graph.json (static entry+preloads and native French locale; this excludes route dynamic imports). Browser measurements, if performed, must additionally account for every request started before translated readiness and collect its final completed size with cache and service workers disabled. No performance claim is established solely by the static graph.

Completed checks: all 41 output variants, 3516 generated exports, exact 50209 physical factory imports/properties, exact 141024 compiled strings including native English fallback, and clean client TypeScript diagnostics. Public static-locale marker is absent from every emitted JS file.

The first reflective graph is 2.25% larger than optimized native under Brotli Q4. The final static-factory graph is 2069223 bytes versus native 2067800 (+0.069%); decoded JS is 3.58% larger. This is a near tie for the measured output-only setup; it is not an engine-free Paraglide result. The identical i18next/react-i18next bundle is 17872 bytes under Q4, 0.86% of the native static graph. Deleting that entire bundle without replacement would yield at most 0.80% static JS transfer savings for this final setup.

A paused intermediate rebuild ended in LIX_ERROR_CLOSED after SIGCONT; its log is retained as candidate-facades-paused-failure.log. The unchanged clean-layout build subsequently completed uninterrupted with the original 8GB Node budget and unmodified public compiler/SDK. The pause-induced failure is excluded from compilation validity and performance evidence.

Four cold UI captures passed exact French body and input-placeholder parity with zero page/console errors and zero request failures. Browser: Playwright 1.64.0, Chrome 156.0.8078.4, explicit installed Chromium1248 binary. Desktop (80ms latency, 20Mbps, 3x CPU, 1280x800) was 1799ms native vs 1791ms facade. Mobile (150ms, 1.6Mbps, 4x CPU, 390x844) was 12297ms vs 12178ms. These are single-pair readiness observations (0.4% and 1.0% improvement), below the >10% repeat gate; no repeated performance claim or five-pair batch is justified.

All ordinary HTTP requests started before translated readiness were allowed to finish before byte accounting. Their encoded body total including navigation is 2278673 bytes native versus 2282052 bytes facade (+0.15%) in both profiles. The app also embeds a hidden silence.mp3 iframe: Chrome leaves its bootstrap media Document request open although its actual media Range request finishes. The completed total already includes that actual 36494-byte media fetch. The pending Document has declared Content-Length 36494 and is reported separately: whole-request totals are bounded by [2278673,2315167] native and [2282052,2318546] facade. The upper bound conservatively permits an additional bootstrap body; it is not a second completed transfer claim. No pending request was declared finished and no network failure was discarded. CDP received-byte snapshots are included where available.

The fixture serves audio as identity with ordinary byte-range support, matching the original native build's absence of a compressed MP3 sidecar. Text/code remain precomputed Brotli Q4. Initial harness attempts that tried to close this persistent media navigation are retained as failed diagnostics and do not count as samples. The final four JSON and PNG files plus ui-parity-summary.json are the accepted UI/readiness evidence.

The replay/ directory is the compact evidence package for benchmark/real-apps/per-locale-production/librechat. LOCAL-ARTIFACTS.json identifies the full app source, frozen native/candidate/reflection dist, 3516-file compiled source, and frozen public compiler source/dist retained outside the repository evidence package. Full output trees must not be committed to the benchmark repository.
