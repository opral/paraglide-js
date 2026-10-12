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

## Conclusion

This candidate does not qualify. Locale loading completes earlier than native, but the route is font-bound and the candidate ships a larger estimated initial graph, with more than twice as many JS requests and 66 additional HTML modulepreloads. The experiment remains useful as a negative result: moving the locale wait out of the module does not remove the preload expansion. No compiler change or PR is proposed from this probe.
