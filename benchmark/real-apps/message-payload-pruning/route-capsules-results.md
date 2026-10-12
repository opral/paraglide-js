# Private automatic route capsule probe

This is an executable static-consumer fixture using the complete pinned Ntfy catalog: 473 message IDs for each of English, French, and German. It is not the Ntfy product route and does not qualify a product PR or a page-load claim.

The isolated source starts at `6997d020813d76f087d585110e62cd54891726e0`. [The unapplied patch](route-capsules-prototype.patch) contains the earlier aggregate implementation plus this capsule extension. It reuses the private aggregation option; that option and this behavior are absent from the published product source.

The compiler generates an await marker in every message wrapper. Vite 8.3.4's rendered-chunk graph identifies which wrappers survive in each output chunk. The plugin emits one content-hashed static-text JSON asset for each chunk and locale, replaces each surviving marker with that chunk's asset URLs, and removes static text from the shared locale JS. Wrappers await their group's base and active locale before exposing synchronous calls. Repeated wrapper markers share a promise and do not request one resource per message. Lazy chunks consequently load their static text when imported, without a caller adding `loadLocale()` after the import.

The initial consumer imports `k0`, `k107`, `k110`, and `k113`; a lazy consumer imports `k1` and `k115`. These include plain text, interpolation, rich parts, and plural markup. All 473 compiler input IDs remain present. Initial capsules contain the initial static key; the late static key `k1` is absent from both initial capsules and appears in the two lazy capsules. Formatted/rich message functions still use the aggregate global union and remain in shared initial locale JS. The lazy formatted `k115` is therefore not deferred by this prototype.

The optimized i18next control uses i18next 26.4.2 and the same Vite 8.3.4 build. It loads the selected French and fallback English HTTP namespaces, with separate initial and lazy scopes derived from the identical fixture consumers. Other locales are deferred. Native catalogs are the original Ntfy resources, including their native plural forms and interpolation names. The fixture maps those names and converts rich markup to structured parts for the visible checks. The comparison covers visible text and markup content, not exact equivalence of the two rich-part object formats.

| Initial requested fixture graph | Requests | Brotli Q4 bytes |
| --- | ---: | ---: |
| Optimized scoped i18next | 5 | 17,438 |
| Private route capsules | 11 | 6,417 |

The 63.20% fixture byte reduction largely includes replacing the i18next runtime in a tiny app. It is not a whole-product migration result. The prototype also makes more initial requests, and no timing, network throttling, field CWV, or live production backend was measured. Lazy activation adds one JS resource and one English/French data resource each in both modes. After activation, changing to German loads both registered groups.

Both modes pass initial French rendering, rich/plural/interpolation checks, lazy activation, `fr → de → en → fr`, an explicit German preload before importing the lazy route, concurrent German switching and lazy import, and a failed German data fetch followed by retry. The failed switch rejects, keeps the visible French locale, and the retry succeeds. The prototype tracks already requested locales so a subsequently registered lazy group also supports earlier explicit preloads; a group revision loop drains registrations before completing a load.

The normal-mode plugin implementation leaf is `45ffec783a30b432844b2142d2edeeb140e5dd9bd9d912ba688eda95b4e0dec7`. Its source file hash is recorded in the [summary](results/route-capsules-summary.json). The public `dist/index.js` re-export hash does not prove implementation identity. Raw reports include full catalog IDs, compiler source diff digest, leaf hashes, Vite/Node/i18next versions, requested resource hashes, and complete built-tree manifests. `compilerUsed: false` distinguishes the native control, which records the adjacent compiler provenance but does not run it.

The first attempted emitted-asset reference used `import.meta.ROLLUP_FILE_URL_<ref>` inserted during `renderChunk`. Rolldown left those references literal, so fetches went to `/undefined` and the fixture failed. That capture was discarded. The working version obtains the emitted asset's hashed filename with `getFileName()` and inserts a relative `new URL(..., import.meta.url)` before chunk hashing. All browser requests in the retained runs resolve. Initial and lazy static data have distinct content hashes; each mode has its own immutable build directory.

One MagicString AST edit pass covers both pruning and marker replacement. A separate sourcemap build traces the app's `window.activateLazyRoute` to `src/main.js:20` and retained French rich text to `messages/fr.js:550`. Static text synthesized from metadata has no original source position. See the [mapping capture](results/route-capsules-sourcemap-trace.json).

This is a feasibility result, with substantial unresolved work. Only Vite 8.3.4's private rendered graph was exercised; absent graph metadata fails closed. The two-group bound is proven for this fixture, not arbitrary application chunk graphs. Multi-entry routes, shared chunks, custom base/CDN paths, CSP, multiple projects, watch/HMR, SSR execution, dynamic namespace fixtures, and many-locale failure/race stress are unverified. The SSR compiler path is not intentionally changed, but this fixture does not execute it. Generic dynamic namespace access must retain all reachable messages and cannot be manually restricted to improve results. A full dynamic bridge in an initial chunk will receive all its static data, eliminating the route-scope benefit there.

To replay, apply the patch in an isolated checkout of the pinned source, install the locked dependencies, run `npm run env-variables`, and rebuild with `tsc --build`. Prepare the pinned Ntfy catalogs with the existing adapter. Then run:

```sh
NTFY_PROJECTION_SOURCE=/path/to/ntfy/web \
NTFY_SOURCE_COMMIT=211ba22860d7483073a8ce13dcda5f467194989b \
NTFY_PROJECTION_MODE=aggregation \
  node benchmark/real-apps/message-payload-pruning/build-route-capsule-fixture.mjs

NTFY_PROJECTION_SOURCE=/path/to/ntfy/web \
NTFY_SOURCE_COMMIT=211ba22860d7483073a8ce13dcda5f467194989b \
NTFY_PROJECTION_MODE=native \
  node benchmark/real-apps/message-payload-pruning/build-route-capsule-fixture.mjs
```

The generator always uses all 473 message IDs. `NTFY_SOURCEMAP=1` writes a separate mapped build and report. The raw [capsule run](results/route-capsules-aggregation.json), [native run](results/route-capsules-native.json), and [mapped run](results/route-capsules-aggregation-sourcemap.json) are retained. TypeScript compilation and these meaningful runtime checks pass. The aggregate prototype's older unit tests were not rerun or represented as capsule coverage.

## Review follow-up: extraction, non-English base, and failure boundary

The renderer passes `dynamicIndexes`, not the complete live-index set, to the shared locale-array transform. `dynamicIndexes` contains only IDs lacking a static text in at least one configured locale. Consequently, fully static `k1` is removed from every shared locale JS asset. The strengthened replay parses all built JS with Acorn and compares decoded string-literal values against the exact late `k1` texts; it finds zero occurrences. The late JSON assets still contain that text. An ID static in one locale and formatted in another is conservatively retained in the shared JS and can duplicate the static side in its capsule; this optimization limit remains.

The generator now supports `NTFY_BASE_LOCALE=de`, preserving all 473 IDs and all three locales. It requests German fallback plus selected French at startup, without English. Initial/lazy rendering, switching, explicit preload before lazy import, and concurrent switching/import pass in both modes. Because German is already cached, the HTTP503 switch probe targets English; the rejection keeps French visible and retry succeeds. These raw runs are [capsules](results/route-capsules-aggregation-base-de-review.json) and [optimized native](results/route-capsules-native-base-de-review.json).

A separate `NTFY_FIXTURE_LOCALES=fr,de` smoke contains no English property, with all 473 IDs for both locales and German base. A fixture-only read-only group-count getter verifies two registered output-chunk groups after lazy activation. This directly exercises the `group[baseLocale]` registry key: a hardcoded `group.en` would collapse both registrations into the same undefined key, a defect that two-locale visible text alone could mask because both locales are eagerly loaded for each group. The getter is explicitly marked `whiteboxInstrumentation` in the [capsule report](results/route-capsules-aggregation-base-de-no-en-review.json); this run is functional evidence only, not a byte comparator. The uninstrumented [native smoke](results/route-capsules-native-base-de-no-en-review.json) passes its visible checks too.

A fresh-page fault probe now rejects the first lazy route capsule with HTTP503. The first lazy module import rejects, and a second attempt still rejects with the cached ESM evaluation error even though the fetch promise was cleared. This is a confirmed fatal lazy-import limitation of the TLA design; the earlier successful retry test covers locale switching after an already evaluated module, not this module-evaluation failure. Recovery needs a different import gate or a reload before this could be a supported product feature. The default-base [review run](results/route-capsules-aggregation-review.json) records both failures. Unmodified initial startup and the meaningful success checks continue to pass.

The new base-parametric native fixture produces 17,420 rather than the earlier archived 17,438 Brotli-Q4 bytes; its generic base variable slightly changes minification. The corresponding uninstrumented capsule graph remains 6,417 bytes. This remains only a tiny fixture comparison. The earlier raw artifacts are preserved in separate directories, and no product compiler source changed during these review follow-ups.

Other review findings remain open before product adoption: markers need a plugin-instance nonce and collision verification; this build-time capsule transformation must fail fast in dev/watch modes and reset per-build caches; support needs explicit capability checks; and a general shared-chunk graph can exceed this fixture's two-group bound. The current artifact is deliberately an unapplied research patch. Do not use its private option in development servers or production applications.

Replay these follow-ups with the same earlier command plus `NTFY_RUN_TAG=-review` and optional `NTFY_BASE_LOCALE=de` / `NTFY_FIXTURE_LOCALES=fr,de`. The tag gives each variant its own build directory and raw report; default captured reports are preserved.
