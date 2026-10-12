# 3x-ui i18next → Paraglide route study

This archive contains the pinned native ES2022 control, a full-catalog Paraglide migration probe, and an isolated Vite chunk-placement experiment. The compiler prototype is not a product change or a qualifying result.

## Pins and scope

- App: [MHSanaei/3x-ui](https://github.com/MHSanaei/3x-ui), commit `74c3cc38821cabd66ad316ea562851422d0b0063`; frontend Vite 8.3.4; lockfile SHA-256 is in `core-chunk-provenance.json`.
- Paraglide base: commit `6997d020813d76f087d585110e62cd54891726e0`. The private all-HTML diagnostic uses the isolated plugin artifact with SHA-256 `f8bb4ec5…331d58`; the core-chunk prototype uses `8f7f1f5f…669a5f6`. Full hashes and source hash are in `core-chunk-provenance.json`.
- Catalog metadata: 13 locales × 2,589 messages, 123 input messages, no markup. Metadata SHA-256 is recorded in the provenance file.
- Route: `/login`, cookie `lang=es-ES`. The app's original `manualChunks` callback is unchanged in both variants. The candidate only applies an isolated compiler-plugin `outputOptions` hook to the compiler-owned core and generated runtime IDs, then delegates every other ID to that callback.

The migration is a test adapter, not a general i18next compatibility layer. Its source audit found 63 dynamic key expressions across the codebase. The startup route's visible Spanish text matched, but 718 of 40,053 whole-catalog comparisons differ only in line endings (CRLF in source versus LF from generated JavaScript templates). The archive does not claim exact string parity.

## Results

The native selected-locale route graph is 2,515,087 raw bytes / 761,326 gzip-9 / 756,264 Brotli-Q4. The ordinary public Paraglide graph is 2,695,481 raw / 752,063 gzip-9 / 746,624 Brotli-Q4. These are independently compressed assets in the route graph, not a measured field transfer. The public candidate is slightly smaller under Brotli but larger raw; it does not clear the requested 10% gate.

The first diagnostic injected the public plugin's standalone locale preloader into every HTML entry, including `login.html`. On that graph, the locale requests still began at about 752 ms. The next diagnostic kept that all-HTML preload and assigned the private locale-split core plus generated runtime to a dedicated chunk. It removed the app's `vendor-router` chunk from the `/login` initial graph while leaving app-level chunking untouched:

| Login route graph | Files | Raw | gzip-9 | Brotli-Q4 |
| --- | ---: | ---: | ---: | ---: |
| Split + private all-HTML preload | 25 | 2,695,662 | 752,181 | 746,720 |
| Dedicated core chunk | 24 | 2,604,134 | 722,595 | 716,535 |

The change saves 30,185 Brotli-Q4 bytes (4.0%) on this route. The `vendor-router` asset is 92,919 raw / 30,767 Brotli-Q4 bytes; it remains emitted for routes that use React Router. The login page no longer downloads it solely to evaluate the Paraglide preload helper. The generated core is already a static dependency of the preloader module and the app facade, so this prototype does not add another core link to the HTML.

That first browser pair compared the Paraglide all-HTML build with the Paraglide core-chunk build, not with native i18next. At 80 ms RTT, 20 Mbps down, 2 Mbps up, 3× CPU, and HTTP/1.1 loopback, it showed FCP 1,020→952 ms and first visible Spanish text 1,202→1,121 ms (both −6.7%). Locale requests moved from 752 ms to 266 ms. Fonts were ready at 95 ms in both. Both pages displayed `Hola`, `Nombre de Usuario`, `Contraseña`, and had no browser errors. This exploratory pair is below the 10% threshold; no repeat batch was run. The raw trace is `core-chunk-startup-probe.json`.

## Native gate pair

The gate comparison uses the frozen native ES2022 build against the all-HTML/core-chunk Paraglide candidate. The native dist was rebuilt with Node 26.3.1, npm 11.8.0, and Vite 8.3.4; it reproduced all previous dist asset hashes, with only Vite's generated manifest needing restoration after the default manifest-disabled build. Both variants use the same app lockfile, ES2022 target, locale cookie, route, server fixture, network throttle, and browser profile. The app's source `manualChunks` callback remains unchanged.

On one fresh-server cold pair, native→Paraglide showed FCP/LCP 1,040→944 ms (−9.2%) and first visible Spanish text 1,220→1,115 ms (−8.6%). The selected Spanish catalog completed at 874 ms native and 609 ms Paraglide; fonts were ready at 95/96 ms. The pages showed identical `Hola`, `Nombre de Usuario`, `Contraseña`, and `Acceder` text with no browser errors. The Paraglide graph used 23 asset requests versus 19 native requests and transferred 716,001 versus 755,793 encoded asset bytes excluding HTML (−5.3%). This is below the 10% user-metric gate, so no repeat batch was run. The raw trace and decoded response hashes are in `native-vs-core-chunk-gate-pair.json`; exact build and artifact provenance are in `native-vs-core-chunk-gate-provenance.json`.

The measured change isolates a compiler-owned import edge, but it is not a >10% user-metric result. The dedicated chunk prototype and all-HTML preload remain diagnostic only.

### Selected-only startup follow-up

A separate compiler-only variant combines the all-HTML preloader and isolated core chunk with a startup promise that loads only `getLocale()` instead of loading both the base and selected locale. The generated metadata and locale modules were unchanged (2,589 messages and 13 locales). This remains an opt-in research patch, not a product default: explicit `en-US` calls and unsupported explicit message locales that fall back to English require callers to await `loadLocale("en-US")` first. That compatibility path was not exhaustively tested here.

One fresh cold pair against the frozen native build showed FCP/LCP 1,024→932 ms (−9.0%) and first visible `Hola` 1,203→1,104 ms (−8.2%). The Spanish locale response ended at 566 ms versus 858 ms native; fonts were ready at 95/96 ms. Visible login text matched and there were no browser errors. The candidate made 22 asset requests versus 19 native requests. Summed encoded asset bodies plus the HTML body were 684,001 versus 756,292 bytes (−9.6%). It remains below the 10% gate, so there was no repeat batch.

This pair compares against the frozen native lazy-locale path. Its locale request began after initial router/vendor scripts at 753 ms, so a matched native early selected-catalog preload is still needed before attributing this improvement to Paraglide. This result is diagnostic only and does not qualify for a PR. The trace and provenance are `native-vs-core-selected-startup-pair.json` and `native-vs-core-selected-startup-provenance.json`. Reproduce it by applying `core-all-html-selected-startup-prototype.patch` to the pinned compiler base; it contains the core chunk/all-HTML changes and selected-only startup patch.

### Rejected Vite-ignore probe

Adding `/* @vite-ignore */` to compiler-owned locale dynamic imports did not preserve Vite's virtual modules. Vite emitted no locale chunks, left bare `virtual:paraglide/client-locale-split/locale/*` imports in the core module, and retained the `vendor-router` preload-helper dependency. The build exited successfully but its output is not runnable; no browser timing was collected. Details and hashes are in `vite-ignore-invalid-build.json`; the exact source change is `vite-ignore-import-prototype.patch`.

## Reproduction

Use Node 26.3.1 and npm 11.8.0 for fresh app builds. Apply `migration/3x-ui-app-migration.patch` at the app root. Copy `migration/prepare-project.mjs` to `frontend/.real-apps/3x-ui-paraglide/prepare-project.mjs` and run it with `PARAGLIDE_REPO` pointing to the compiler checkout. Build against the compiler's `dist` with `PARAGLIDE_DIST` set. The patch updates `frontend/vite.config.js`; enable `build.manifest` only when reproducing the archived graph JSON.

For the private all-HTML control, build the pinned compiler with the saved `all-html-preload-ablation.patch`. For the core-chunk diagnostic, apply `core-chunk-plus-all-html-prototype.patch` to the same compiler base. For the selected-only follow-up, use `core-all-html-selected-startup-prototype.patch` instead. Run `pnpm run env-variables && pnpm exec tsc --build`, then point `PARAGLIDE_DIST` at that checkout's `dist`. These patches live only in the benchmark archive; none is a public compiler flag.

`graph.mjs` reproduces asset-size accounting from Vite's manifest. `serve.cjs` serves a supplied `DIST_ROOT` with Brotli-Q4 compression. `core-chunk-startup-probe.mjs` records one paired route sample and decoded response hashes; set `PLAYWRIGHT_MODULE`, `NATIVE_ORIGIN`, `PARAGLIDE_ORIGIN`, `BASELINE_NAME`, `PARAGLIDE_NAME`, and `OUTPUT_FILE` explicitly. Restart the fixture servers after every build so no in-memory compressed response cache can serve stale assets.

## Provenance caveat

The Paraglide all-HTML/core diagnostic pair records its original toolchain in `core-chunk-provenance.json`; the Paraglide-only all-HTML baseline used a different npm executable from the core candidate. The native gate pair avoids that comparison: its native dist was rebuilt under Node 26.3.1/npm 11.8.0 and its candidate dist was built under the same recorded Node/npm versions. Keep the two pairings distinct when interpreting or reproducing these results.

## Luna review

GPT-6 Luna (extra-high reasoning) reviewed the prototype and report without running builds or timing samples. The function-valued `manualChunks` path preserves this app's callback. The object-valued path incorrectly indexes a chunk-name-to-module-list map by module ID; it must preserve those assignments before any product implementation. The all-HTML insertion also needs entry selection, correct relative paths for nested HTML with `base: "./"`, and integration with CSP nonce/SRI policies. This capture uses localized root-level entries, default `/` base, and no nonce/SRI policy, so those limitations do not invalidate its measurements.

The review found no TLA cycle in the measured graph. Locale overrides installed during app startup and per-entry locale state need separate coverage. The package declares Vite >=5, while this experiment covers Vite 8.3.4 only; ES2022 remains required. The reviewer evaluated the earlier Paraglide-to-Paraglide pair; the later optimized-native comparison is recorded separately above.
