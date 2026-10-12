# 3x-ui i18next → Paraglide route study

This archive contains the pinned native ES2022 control, a full-catalog Paraglide migration probe, and an isolated Vite chunk-placement experiment. The compiler prototype is not a product change or a qualifying result.

## Pins and scope

- App: [MHSanaei/3x-ui](https://github.com/MHSanaei/3x-ui), commit `74c3cc38821cabd66ad316ea562851422d0b0063`; frontend Vite 8.3.4; lockfile SHA-256 is in `core-chunk-provenance.json`.
- Paraglide base: commit `6997d020813d76f087d585110e62cd54891726e0`. The public all-HTML diagnostic uses the isolated plugin artifact with SHA-256 `f8bb4ec5…331d58`; the core-chunk prototype uses `8f7f1f5f…669a5f6`. Full hashes and source hash are in `core-chunk-provenance.json`.
- Catalog metadata: 13 locales × 2,589 messages, 123 input messages, no markup. Metadata SHA-256 is recorded in the provenance file.
- Route: `/login`, cookie `lang=es-ES`. The app's original `manualChunks` callback is unchanged in both variants. The candidate only applies an isolated compiler-plugin `outputOptions` hook to the compiler-owned core and generated runtime IDs, then delegates every other ID to that callback.

The migration is a test adapter, not a general i18next compatibility layer. Its source audit found 63 dynamic key expressions across the codebase. The startup route's visible Spanish text matched, but 718 of 40,053 whole-catalog comparisons differ only in line endings (CRLF in source versus LF from generated JavaScript templates). The archive does not claim exact string parity.

## Results

The native selected-locale route graph is 2,515,087 raw bytes / 761,326 gzip-9 / 756,264 Brotli-Q4. The ordinary public Paraglide graph is 2,695,481 raw / 752,063 gzip-9 / 746,624 Brotli-Q4. These are independently compressed assets in the route graph, not a measured field transfer. The public candidate is slightly smaller under Brotli but larger raw; it does not clear the requested 10% gate.

The first diagnostic injected the public plugin's standalone locale preloader into every HTML entry, including `login.html`. On that graph, the locale requests still began at about 752 ms. The next diagnostic kept that all-HTML preload and assigned the private locale-split core plus generated runtime to a dedicated chunk. It removed the app's `vendor-router` chunk from the `/login` initial graph while leaving app-level chunking untouched:

| Login route graph | Files | Raw | gzip-9 | Brotli-Q4 |
| --- | ---: | ---: | ---: | ---: |
| Public all-HTML preload | 25 | 2,695,662 | 752,181 | 746,720 |
| Dedicated core chunk | 24 | 2,604,134 | 722,595 | 716,535 |

The change saves 30,185 Brotli-Q4 bytes (4.0%) on this route. The `vendor-router` asset is 92,919 raw / 30,767 Brotli-Q4 bytes; it remains emitted for routes that use React Router. The login page no longer downloads it solely to evaluate the Paraglide preload helper. The generated core is already a static dependency of the preloader module and the app facade, so this prototype does not add another core link to the HTML.

That first browser pair compared the Paraglide all-HTML build with the Paraglide core-chunk build, not with native i18next. At 80 ms RTT, 20 Mbps down, 2 Mbps up, 3× CPU, and HTTP/1.1 loopback, it showed FCP 1,020→952 ms and first visible Spanish text 1,202→1,121 ms (both −6.7%). Locale requests moved from 752 ms to 266 ms. Fonts were ready at 95 ms in both. Both pages displayed `Hola`, `Nombre de Usuario`, `Contraseña`, and had no browser errors. This exploratory pair is below the 10% threshold; no repeat batch was run. The raw trace is `core-chunk-startup-probe.json`.

## Native gate pair

The proper gate comparison uses the optimized native ES2022 build against the best all-HTML/core-chunk Paraglide candidate. The frozen native dist was rebuilt with Node 26.3.1, npm 11.8.0, and Vite 8.3.4; the build reproduced all previous dist asset hashes, with only Vite's generated manifest needing restoration after the default manifest-disabled build. Both variants use the same app lockfile, ES2022 target, locale cookie, route, server fixture, network throttle, and browser profile. The app's source `manualChunks` callback remains unchanged.

On one fresh-server cold pair, native→Paraglide showed FCP/LCP 1,040→944 ms (−9.2%) and first visible Spanish text 1,220→1,115 ms (−8.6%). The selected Spanish catalog completed at 874 ms native and 609 ms Paraglide; fonts were ready at 95/96 ms. The pages showed identical `Hola`, `Nombre de Usuario`, `Contraseña`, and `Acceder` text with no browser errors. The Paraglide graph used 23 asset requests versus 19 native requests and transferred 716,001 versus 755,793 encoded asset bytes including the HTML response (−5.3%). This is below the 10% user-metric gate, so no repeat batch was run and this prototype is not a qualifying result. The raw trace and decoded response hashes are in `native-vs-core-chunk-gate-pair.json`; exact build and artifact provenance are in `native-vs-core-chunk-gate-provenance.json`.

The measured change isolates a compiler-owned import edge, but it is not a >10% user-metric result. The dedicated chunk prototype and all-HTML preload remain diagnostic only.

## Reproduction

Use Node 26.3.1 and npm 11.8.0 for fresh app builds. Apply `migration/3x-ui-app-migration.patch` at the app root. Copy `migration/prepare-project.mjs` to `frontend/.real-apps/3x-ui-paraglide/prepare-project.mjs` and run it with `PARAGLIDE_REPO` pointing to the compiler checkout. Build against the compiler's `dist` with `PARAGLIDE_DIST` set. The patch updates `frontend/vite.config.js`; enable `build.manifest` only when reproducing the archived graph JSON.

For the ordinary public control, build the pinned compiler with the saved `all-html-preload-ablation.patch`. For the core-chunk diagnostic, apply `core-chunk-plus-all-html-prototype.patch` to the same compiler base, run `pnpm run env-variables && pnpm exec tsc --build`, and point `PARAGLIDE_DIST` at its `dist`. These patches live only in the benchmark archive; neither is a public compiler flag.

`graph.mjs` reproduces asset-size accounting from Vite's manifest. `serve.cjs` serves a supplied `DIST_ROOT` with Brotli-Q4 compression. `core-chunk-startup-probe.mjs` records one paired route sample and decoded response hashes; set `PLAYWRIGHT_MODULE`, `NATIVE_ORIGIN`, `PARAGLIDE_ORIGIN`, `BASELINE_NAME`, `PARAGLIDE_NAME`, and `OUTPUT_FILE` explicitly. Restart the fixture servers after every build so no in-memory compressed response cache can serve stale assets.

## Provenance caveat

The Paraglide all-HTML/core diagnostic pair records its original toolchain in `core-chunk-provenance.json`; the Paraglide-only all-HTML baseline used a different npm executable from the core candidate. The native gate pair avoids that comparison: its native dist was rebuilt under Node 26.3.1/npm 11.8.0 and its candidate dist was built under the same recorded Node/npm versions. Keep the two pairings distinct when interpreting or reproducing these results.
