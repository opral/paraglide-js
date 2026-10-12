# Vite locale-module packing

This pass improves **compiled localization JavaScript**, measured after Vite 8.1.4 production tree shaking and default minification. It does not establish a whole-app page-load improvement or a 40% migration advantage over i18next.

The comparison holds `outputStructure: "locale-modules"` constant. Main `9446dd98ff578c96d76fe40b22be268bf7ac17ed` and the first draft's guarded locale layout have the same emitted byte counts. The candidate runs the same real catalogs through the compiler's private Vite layout and the exact `packLocaleFunctionChunk` implementation used by the Vite plugin.

| Catalog                               | Main locale gzip | Packed gzip | Reduction | Main locale Brotli | Packed Brotli | Reduction |
| ------------------------------------- | ---------------: | ----------: | --------: | -----------------: | ------------: | --------: |
| DrawDB, 51 locales / 364 keys         |        298,846 B |   261,237 B |     12.6% |          230,024 B |     183,278 B |     20.3% |
| Memos, 46 locales / 911 included keys |        754,598 B |   633,912 B |     16.0% |          548,248 B |     430,396 B |     21.5% |

DrawDB includes every catalog key. Memos excludes two plural keys on both sides; its production frontend loads locales lazily, so this complete-catalog result is a stress workload, not its initial-page payload. The results preserve pinned source commits, actual dependency versions, catalog/compiler hashes, and parity counts. Each final minified Paraglide bundle and i18next bundle passed 18,564 DrawDB or 41,906 Memos key/locale comparisons. Selected-locale switching was also checked before bundling.

Against i18next in this same isolated workload, DrawDB's packed gzip remains 1.2% larger (261,237 vs 258,253 B), while Brotli is 12.3% smaller (183,278 vs 208,875 B). Memos is 16.3% smaller by gzip and 9.1% by Brotli. The native side preserves original catalog hierarchy and property order. These are localization-component comparisons, not app-wide migration percentages.

## Behavior and boundaries

The compiler gives locale helpers private names while preserving the existing exported message IDs and signatures. After Vite prunes unused messages and links chunks, the pass groups pure, zero-parameter string-returning helpers by locale, rewrites safe calls to indexed string data, and removes the now-unreferenced helpers. It preserves argument evaluation and rejects nested edits that would overlap. There is no new user-facing compiler flag or runtime dependency.

The pass only handles groups with at least 16 eligible helpers and at least two distinct values. Tiny groups are left alone because Vite can optimize them well already; independent Vite 6/8 measurements found small two/three-helper cases can grow a few compressed bytes. Exported, escaped, mutated, spread-call, shadowed, or early-read helpers retain their original implementation. Code-split exports are preserved. Markup and formatter helpers are not pure literal candidates.

Normal CLI/standalone compilation and other bundlers keep their previous output. `build.minify: false`, static-locale builds, and middleware locale splitting keep standard generation. A chunk with direct `eval`, unsupported syntax, or no private helpers is skipped. A lexical precheck can conservatively skip a harmless `eval(` inside text or comments. Direct locale-file export keys remain unchanged, though an implementation helper's function `.name` can differ; the supported message-call API does not depend on that name.

The native-app survey in `native-route-survey.md` records why large localization percentages do not necessarily become large route wins. Langflow's selected-locale render dependency is real, but its measured preload benefit belongs to native i18next under an injected delay; it is not a Paraglide result.

## Full DrawDB app

The actual pinned DrawDB app uses Vite 8.1.0. Its main chunk contains Lottie's direct `eval`, so the pass is intentionally skipped. The function-based fallback emits the **identical main JavaScript bytes** as the locale baseline:

| Variant                         |  Raw main JS | Gzip main JS | SHA-256                                                            |
| ------------------------------- | -----------: | -----------: | ------------------------------------------------------------------ |
| Native i18next                  | 17,167,621 B |  3,141,919 B | `915aa0189ab974511fb6846981857b7160b4dc8456c3f6bab5ad089b3dbfc88b` |
| Paraglide locale baseline       | 17,276,166 B |  3,165,434 B | `c74d3833f0b73115ad368cbf148c767c990090ed2593c3b0575cd595c0bb1c71` |
| Vite function-packing candidate | 17,276,166 B |  3,165,434 B | `c74d3833f0b73115ad368cbf148c767c990090ed2593c3b0575cd595c0bb1c71` |

This removes the rejected tuple prototype's 1,353-byte gzip regression, but supplies **no whole-app improvement** on DrawDB. No new page-load timing claim follows from identical output. The first draft's separate message-module app/browser comparison remains in `drawdb-results.md`.

## Reproduce

Use the pinned checkouts and dependency installation described in `README.md`. Build main into `.real-apps/baseline-compiler` and the candidate into `.real-apps/packed-compiler`, keeping complete separate compiler snapshots.

```sh
PARAGLIDE_OUTPUT_STRUCTURE=locale-modules node benchmark/real-apps/run.mjs drawdb /absolute/path/to/drawdb locale-baseline .real-apps/baseline-compiler
PARAGLIDE_OUTPUT_STRUCTURE=locale-modules node benchmark/real-apps/run.mjs drawdb /absolute/path/to/drawdb locale-functions .real-apps/packed-compiler
PARAGLIDE_OUTPUT_STRUCTURE=locale-modules node benchmark/real-apps/run.mjs memos /absolute/path/to/memos locale-baseline .real-apps/baseline-compiler
PARAGLIDE_OUTPUT_STRUCTURE=locale-modules node benchmark/real-apps/run.mjs memos /absolute/path/to/memos locale-functions .real-apps/packed-compiler

DRAWDB_VARIANTS=locale-baseline,locale-functions \
DRAWDB_PACKER_COMPILER=/absolute/path/to/paraglide/.real-apps/packed-compiler \
DRAWDB_PACKER_VARIANTS=locale-functions \
DRAWDB_OUTPUT=/absolute/path/to/paraglide/.real-apps/drawdb-functions \
node benchmark/real-apps/migrate-drawdb.mjs
```

Gzip uses Node's default compression; isolated Brotli uses quality 11. The driver reports which chunks were actually changed, so an enabled hook is not mistaken for an applied optimization. Packer/build timings and Node microbenchmarks are diagnostic, not release gates. Source-ordered edits reduced observed packing work from roughly 8/60 seconds to 0.6/1.2 seconds for DrawDB/Memos while retaining the same final byte counts; those single-run timings are not a universal build-speed claim.

Independent GPT-6 Luna extra-high reviews and the multi-turn API task probe are in `luna-packing-review.md` and `luna-packing-ax.md`. These are local engineering evaluations, not user studies or evidence of migration demand.
