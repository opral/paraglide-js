# Vite default-output dispatcher matrices

This is an additional optimization on the first two drafts. It holds the default `message-modules` output structure constant and packs surviving fully static dispatchers **after Vite tree shaking and before its production minifier**. There is no new user option or runtime library. The comparison is against the first draft's inline-static output; the second draft leaves this default layout unchanged.

| Catalog                                       | Inline gzip → matrix gzip | Reduction | Inline Brotli → matrix Brotli | Reduction |
| --------------------------------------------- | ------------------------: | --------: | ----------------------------: | --------: |
| DrawDB, 51 locales / 364 keys                 |       324,783 → 242,488 B |     25.3% |           208,589 → 178,922 B |     14.2% |
| Memos, 46 locales / 911 included keys         |       765,287 → 546,884 B |     28.5% |           483,414 → 412,016 B |     14.8% |
| AnythingLLM, 31 locales / 1,248 included keys |       855,154 → 556,916 B |     34.9% |           517,322 → 454,032 B |     12.2% |

DrawDB and Memos use Vite 8.1.4; AnythingLLM uses its installed Vite 4.5.3. These are isolated localization-component bundles with gzip defaults and Brotli quality 11. All final minified bundles pass 18,564 / 41,906 / 38,688 included key-locale comparisons against the actual installed i18next version. Memos excludes two plural-form keys, AnythingLLM six; string equality alone does not establish React `<Trans>` parity. Native catalogs retain source namespace, hierarchy and property order.

Against each app's native isolated i18next bundle, matrix output is 6.1% / 27.7% / 23.3% smaller by gzip and 14.3% / 13.0% / 11.3% smaller by Brotli respectively. Combining the first draft and this change reduces Paraglide's default complete-catalog gzip by 44.7% / 46.3% / 49.5% versus main `9446dd98ff578c96d76fe40b22be268bf7ac17ed`. These cumulative figures compare Paraglide to its previous output, not to i18next or whole apps.

## Implementation and behavior

Vite-only generation encodes the base locale in the dispatcher's private local selector binding. It preserves public message identifiers, arguments, export aliases and properties. The chunk pass recognizes module-level arrow functions with the exact generated local-declaration and static-return shape. Groups of at least 32 functions, eight locales and non-identical message values share a locale-major matrix and a strict `switch` selector. Unknown strings and non-string locale overrides still take the original base-locale branch without property-key coercion. Locale resolution and inputs/options evaluation are preserved.

Partial, formatted, multi-variant and markup dispatchers retain their existing code. Smaller groups are skipped. Only retained functions participate, so unused messages never become entries in a pre-generated global table. Source maps include original chunk contents and high-resolution mappings; hashbangs and directive prologues remain intact. Actual direct `eval` or `with` anywhere in the chunk prevents transformation, including comment-spaced calls discovered by the AST scan. Harmless text or comments do not trigger that bailout.

CLI/standalone and other bundlers retain standard generation. Unminified, middleware and static-locale builds do not use the pass. The persistent compilation cache version changes so earlier output cannot hide the new marker mode.

## Production AnythingLLM onboarding

The full migration preserves all 31 locale choices, ordinary messages, numeric plurals, regional fallback, reactive language changes and markup components. Both variants build with the app's Vite 4.5.3. The native control keeps stock i18next initialization and every catalog; only its language-dropdown metadata comes from a validated static locale list. The migration obtains that list from generated runtime metadata, avoiding a redundant import of the native catalogs just to call `Object.keys(resources)`.

Five alternating cold browser pairs on French `/onboarding` use Brotli Q4, no cache, 20 Mbps down / 2 Mbps up, 80 ms RTT and 3× CPU, Chromium 143:

| Metric                           | Native i18next control |   Paraglide | Reduction |
| -------------------------------- | ---------------------: | ----------: | --------: |
| Same-origin subresource transfer |            1,004,360 B |   486,178 B |     51.6% |
| Median FCP                       |                 764 ms |      532 ms |     30.4% |
| Median LCP                       |                 764 ms |      532 ms |     30.4% |
| Main chunk raw bytes             |            3,496,674 B | 1,525,691 B |     56.4% |
| Main chunk Brotli-Q4 body        |              882,395 B |   364,213 B |     58.7% |

`transferSize` includes response headers and encoded subresource bodies; it excludes the top-level HTML navigation. It is not a count of Brotli body bytes alone. Both variants render `Bienvenue / Commencer` without browser errors under the same read-only API fixtures. These are controlled local route measurements, not field Core Web Vitals or all-page results. Two earlier repeated runs are retained separately; the current-artifact run above is the primary result.

The app-specific migration checks 38,192 ordinary key/locale pairs, 837 numeric plural cases, nine regional cases and 496 markup renders. Luna independently reran parity, verified nested greetings, all literal-default call sites in the pinned catalogs, native catalog retention and live language switching. This is not a general i18next adapter: untested APIs, future catalog changes and other routes require their own validation. An optimized lazy-loading i18next migration is not the comparator.

See [the migration replay](anything-migration/README.md), [module inventory](anything-module-breakdown.md), [independent review](luna-anything-migration-review.md), and the checked-in raw results. The full DrawDB chunk still contains actual Lottie `eval` and is correctly skipped; its prior no-win result remains recorded.

## Limits and review

The >=32-function / >=8-locale threshold is an empirical guard, not a guarantee that every string distribution compresses better. Luna's intentionally repetitive synthetic fixtures still regress gzip/Brotli by tens of bytes. A large project split into groups below the gate can also retain private marker names, causing small minifier/compressor naming differences on Vite 4/6. These cases are disclosed in [the compiler review](luna-dispatch-review.md); the three real-catalog compressed-byte gates and the production route establish this change's measured value.

Vite 4/6/8 differential browser probes preserve eager/lazy loading, unknown and boxed-locale fallback, active locale changes, interpolation and markup. High-resolution source maps retain mappings and original sources. Multi-turn agent tasks are recorded in [the agent evaluation](luna-dispatch-ax-eval.md). No new public compiler flag or message API is introduced.

## Reproduce component gate

Use the pinned checkouts and installations from `README.md` / `anything-llm-results.md`. Keep independent compiler snapshots for the inline baseline and current candidate.

```sh
node benchmark/real-apps/run.mjs drawdb /absolute/path/to/drawdb inline .real-apps/inline-compiler
node benchmark/real-apps/run.mjs drawdb /absolute/path/to/drawdb dispatch-matrix .real-apps/dispatch-compiler
node benchmark/real-apps/run.mjs memos /absolute/path/to/memos inline .real-apps/inline-compiler
node benchmark/real-apps/run.mjs memos /absolute/path/to/memos dispatch-matrix .real-apps/dispatch-compiler
node benchmark/real-apps/run.mjs anything-llm /absolute/path/to/anything-llm inline .real-apps/inline-compiler
node benchmark/real-apps/run.mjs anything-llm /absolute/path/to/anything-llm dispatch-matrix .real-apps/dispatch-compiler
```

The runner detects the candidate's internal dispatch packer and uses the exact compiler marker and chunk implementation. Result files retain source/catalog/native-resource/compiler hashes and actual packing status. The byte gate excludes build timings and Node translation microbenchmarks. A scratch global-string dictionary alternative regressed the matrix candidate's AnythingLLM gzip by about 12% and was rejected.
