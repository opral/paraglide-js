# Frigate localized-route probe

This is a one-route diagnostic, not a performance qualification. The candidate is a scratch hybrid adapter that builds selected catalogs into Paraglide and keeps i18next's HTTP backend for other namespaces. It did not remove i18next from the application.

## Pinned inputs

- Frigate source: `ff9eb8f18430198548d9c9d2cf138ed9ac7b526b`.
- Toolchain: Vite `8.3.3`, i18next `26.4.2`, ES2022 output.
- Paraglide package source: `6997d020813d76f087d585110e62cd54891726e0`.
- Compiler dist entry SHA-256: `72884458211415a046050e655997ed49caaf56b7697012790dab084d32a62bc1`.
- Client locale-split plugin SHA-256: `c06f8dd894f68f6040deeb8ff62d449d4b133fb12bb78520dd5e7f9a5c49dd70`.
- Native output: `native-lazy-es2022-dist/`.
- Paraglide output: `paraglide-async-init-dist/` (the earlier top-level-await output is `paraglide-tla-dist/`).

## Catalog inventory and correctness

The adapter compiles 33 locales and nine native-live-route namespaces: `common`, `objects`, `audio`, `components/camera`, `components/dialog`, `components/player`, `views/live`, `views/settings`, and `views/system`.

The earlier source inventory overstated the globally configured native namespace count as 29. The pinned source has 28 `ns` entries; all 28 files exist in both en and fr. Corrected all-configured catalog totals are 56 files, 565,625 raw bytes, and 160,687 Brotli-Q4 bytes. The route set totals below were already correct.

The source has 3,040 distinct raw `(namespace, path)` tuples. i18next's `keySeparator: "."` maps these to 3,039 semantic IDs: `views/live.documentTitle.withCamera` is represented as a nested path in en, bs, and be, and as one dotted key in the other locales. The adapter canonicalizes this path so the French document title matches native behavior. The fail-fast inventory check `check-paraglide-inventory.mjs` verifies the source raw/canonical counts, 33 locale codes, and exact equality between canonical IDs, adapter map, and compiler metadata. It rejects a compiler run that emits zero messages.

The strict-error desktop route probe rendered the same title, body text, and French controls in both builds:

- Title: `Front Door - Direct - Frigate`.
- Visible controls: `Retour` and `Historique`.
- No page errors and no click, hover, keyboard, pointer, or touch input before the controls appeared.

The probe source is `e2e/specs/namespace-load-probe.spec.ts`; result files are `native-es2022-route.desktop.json`, `paraglide-es2022-route.desktop.json`, and `paraglide-async-init-route.desktop.json`.

## Route evidence

All numbers below are one-run diagnostics, not paired timing claims. The server used HTTP/1.1. The ready marker is naturally rendered on `/#front_door`; no interaction or fixed wait creates it. In the native build, the marker appeared at 497.8 ms as Inter Medium finished at 497.3 ms. Selected en/fr locale JSON had all completed by 257.1 ms. This confirms that the visible-control marker is font-bound in this route, not a delayed harness action.

The first Paraglide adapter variant used top-level await. The second moved the wait to an `i18nReady` promise and started React rendering after it resolves. Both rendered matching French content. In the second variant, the en and fr Paraglide locale modules completed by about 56 ms, while Inter Medium and the translated controls appeared at 504.2/504.3 ms. Moving the await did not reduce the initial graph: Vite still emitted 80 `modulepreload` links, compared with 14 in the native build.

The route graph included 42 JS resources and 44 captured JS/CSS assets in native, compared with 112 JS resources and 114 captured JS/CSS assets in the async-init candidate. Adding the two font files, the selected native locale catalogs, and `index.html`, Brotli Q4 over the built file contents estimated 1,399,964 bytes for native and 1,511,393 bytes for the candidate (+8.0%). This offline estimate omits same-route API responses and small shared static assets; it is not a production-server transfer capture.

The native ready marker appeared at 497.8 ms; the async-init candidate marker appeared at 504.3 ms in the single probes. Both coincide with Inter Medium completion. There is no evidence here for a >10% user-facing improvement, so no timing batch was run.

## Standalone preload ablation

To isolate the compiler's standalone HTML preload entry, I rebuilt the same TLA adapter with a private compiler copy whose only source change gates `emitFile()` for that entry behind `PARAGLIDE_DISABLE_CLIENT_LOCALE_PRELOAD=1`. The app adapter, generated project, route map, compiler source pin, Vite config, and catalog inputs were unchanged; pre-build and post-build input hashes matched, and the full locale/message inventory check passed. The ablation build also passed the strict-error French route check with the same title and controls and no page errors. French controls appeared at 504.3 ms as Inter Medium completed at 503.9 ms. This is a request-graph diagnostic, not a timing run.

| Build | HTML modulepreloads | JS requests | JS/CSS responses | Brotli-Q4 route bytes |
| --- | ---: | ---: | ---: | ---: |
| Native optimized i18next | 14 | 42 | 44 | 1,399,964 |
| TLA Paraglide | 80 | 112 | 114 | 1,511,352 |
| TLA Paraglide, standalone preload disabled | 79 | 110 | 112 | 1,511,146 |

Disabling the standalone entry removes one preload link and only 206 Brotli-Q4 bytes relative to the TLA candidate. The candidate still has 65 more HTML preloads than native and remains 111,182 Brotli-Q4 bytes larger. The earlier async-init adapter, which moved the wait behind an explicit readiness promise, also retained 80 preloads. These results rule out the standalone preload entry and the adapter's top-level await as explanations for the expanded graph in this probe.

The ablated output contains 79 preloads; its HTML module list includes app chunks such as `Trans`, `api`, `auth-context`, `CameraGroupSelector`, and `settings`. Grouping requested output files by basename after removing the final eight-character bundler hash finds 65 candidate-only groups totaling 443,217 Q4 bytes. Large examples are `candidate-i18n` (74,803), `isPWA` (45,623), the English helper chunk `en` (42,379), `ws` (31,447), `types` (29,373), `sectionPages` (26,048), and the selected Paraglide English/French locale chunks (57,364 combined). The nine en/fr native locale JSON groups absent from the candidate total 87,134 Q4 bytes. Shared-name groups shrink by 244,901 Q4 bytes net, led by native `main` and `src` shrinking by 254,905 combined; other changed chunks and HTML offset about 10,004 bytes of that reduction. Those output-level deltas reconcile to the 111,182-byte route increase. The additional modules include app chunks that were not separate native route assets, while several native route modules were folded into candidate `main`/`src`; output names identify emitted chunks, not exact source-module marginal costs.

Raw browser trace and requested-asset manifest: `results/paraglide-preload-ablated-route.desktop.json` and `results/paraglide-preload-ablated-route-assets.json`. `compare-route-assets.py` reproduces the output-group arithmetic above. The exact one-condition source diff is archived in `compiler-preload-ablation.patch`; its modified plugin file SHA-256 is recorded in `compiler-preload-ablation.patch.sha256`. The private ablation compiler was derived from source pin `6997d020813d76f087d585110e62cd54891726e0`; it is a diagnostic copy and is not a proposed compiler change.

## Conclusion

This candidate does not qualify. Locale loading completes earlier than native, but the route is font-bound and the candidate ships a larger estimated initial graph, with more than twice as many JS requests and 65 additional HTML modulepreloads after the standalone preload is disabled. The experiments remain useful as a negative result: moving the locale wait or removing the standalone preload entry does not remove the expanded split-module graph. No compiler change or PR is proposed from this probe.
