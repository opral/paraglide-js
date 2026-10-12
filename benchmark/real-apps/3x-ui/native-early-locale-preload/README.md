# Native early-locale preload fairness control for 3x-ui

This archive adds a bounded native i18next control to the existing 3x-ui comparison. It starts the same already-lazy selected locale fetch earlier while leaving i18next, its catalogs, its `import.meta.glob` loader, language selection, and application chunking intact. The Vite build output is byte-identical to the clean ES2022 native build except for the three HTML pages, which receive a small cookie-gated module-preload bootstrap.

The control’s `generateBundle` hook runs after Vite’s HTML output is finalized. It collects exact filenames for the existing dynamic locale chunks, inserts an inline classic script before each page’s app module script, and adds a `modulepreload` link only for a supported cookie. The panel pages use `lang`; the subscription page uses a nonempty `subLang`, otherwise `lang`. Invalid and absent cookies issue no locale preload. The statically available `en-US` fallback does not need a dynamic fetch. The original `readyI18n()` import still runs and awaits the same module; the browser module map deduplicates the fetch.

A first attempt added separate HTML module-script entries. Vite folded those imports into a shared app dependency, so they did not start before the app graph. The final native control uses the post-bundle HTML injection above. The injected bootstrap is deliberately specific to this fixture and does not make a general CSP claim.

## Pinned app and build

- Repository: `https://github.com/MHSanaei/3x-ui`
- App commit: `74c3cc38821cabd66ad316ea562851422d0b0063`
- Frontend Vite: `8.3.4`
- Target: `es2022` for both native and Paraglide builds
- `frontend/package-lock.json` SHA-256: `4102c5530996fa24f8152bdeaee99f73a8bd4c85d86e562a707a2a1e7bef43a7`
- Build toolchain: Node `26.3.1`, npm `11.8.0`
- Command: `npm run build -- --manifest`
- Translation catalogs: all original catalogs retained; the initial Spanish login route requests the existing `es-ES` chunk. `en-US` remains the app’s static fallback.

`native-early-preload.patch` applies to the pinned app source. The output identity check compares all files in the fresh native ES2022 dist against the instrumented dist: 165 files are identical; only `index.html`, `login.html`, and `subpage.html` differ. The emitted Vite manifest is identical. `dist-file-hashes.json` and `native-js-identity-check.json` record the output identity.

## One-pair results

Each cold pair uses a fresh browser context with cache disabled, `lang=es-ES`, the read-only login API fixtures, and the same Brotli-Q4 server. The locale-ready marker is the first visible Spanish greeting, `Hola`, not a fixed wait. Both candidates rendered the same Spanish login text and reported no page errors. Font readiness was similar across variants.

| Profile | Candidate | Native → candidate first Spanish text | FCP / LCP | Full resource transfer | Encoded resource bodies |
| --- | --- | ---: | ---: | ---: | ---: |
| Desktop: 80ms RTT, 20Mbps down, 2Mbps up, 3× CPU | Selected-only core | 1120 → 1090ms (−2.7%) | 944 → 924ms (−2.1%) | 762,166 → 690,709B (−9.4%) | 755,866 → 683,509B |
| Mobile: 150ms RTT, 1.6Mbps down, 2Mbps up, 4× CPU | Selected-only core | 4810 → 4448ms (−7.5%) | 4464 → 4096ms (−8.2%) | 762,166 → 690,709B (−9.4%) | 755,866 → 683,509B |
| Desktop: 80ms RTT, 20Mbps down, 2Mbps up, 3× CPU | Base + selected core | 1126 → 1133ms (+0.6%) | 948 → 960ms (+1.3%) | 762,166 → 723,574B (−5.1%) | 755,866 → 716,074B |
| Mobile: 150ms RTT, 1.6Mbps down, 2Mbps up, 4× CPU | Base + selected core | 4840 → 4634ms (−4.3%) | 4484 → 4280ms (−4.6%) | 762,166 → 723,574B (−5.1%) | 755,866 → 716,074B |

“Full resource transfer” sums browser `transferSize` for all resources and includes transfer headers. “Encoded resource bodies” sums `encodedBodySize` and excludes headers. They are separate denominators; both resource sums exclude the HTML navigation, whose timing is recorded separately. Timings and resource counts are in each raw Playwright JSON file. These are one-pair diagnostics; none of the readiness changes reached 10%, so no repeated batch was run.

The selected-only core startup change has a compatibility limitation: it loads only the selected locale, while explicit `en-US` calls and unsupported explicit locales that fall back to English require `await loadLocale("en-US")` first. It remains a private research variant. The base-plus-selected core control preserves the existing base-locale load and was within 5% of the early-preloaded native control.

## Cookie fast-path checks

`cookie-preload-probe.json` records six browser cases:

- Panel `lang=es-ES` fetches the Spanish module once and renders Spanish.
- Invalid or absent panel `lang` does not fetch Spanish and renders English.
- Subscription `subLang=es-ES`, and absent `subLang` with `lang=es-ES`, fetch Spanish and render Spanish.
- An invalid nonempty `subLang` takes precedence over a valid panel `lang` and does not fetch Spanish.

Every case had no page errors. The test requests `/subpage.html` directly because the isolated static fixture does not reproduce the Go route that maps subscription paths to `subpage.html`.

## Reproduction

Apply `native-early-preload.patch` to the pinned 3x-ui source, then build with the pinned Node/npm versions. For a local controlled run, use `serve.cjs` with a `DIST_ROOT` and `PORT` for each immutable dist. `desktop-probe.mjs` runs the 80ms/20Mbps/3× profile; `mobile-probe.mjs` runs the 150ms/1.6Mbps/4× profile. Set `PLAYWRIGHT_MODULE`, `NATIVE_ORIGIN`, `PARAGLIDE_ORIGIN`, and `OUTPUT_FILE`. `cookie-preload-probe.mjs` checks cookie behavior against the native control.

The selected-only candidate provenance is `selected-only-candidate-provenance.json`; the base-plus-selected candidate provenance is `core-chunk-provenance.json`. The adjacent `../paraglide/` archive contains the compiler prototype patches. Candidate dist manifests and all file hashes are captured in `dist-file-hashes.json`.
