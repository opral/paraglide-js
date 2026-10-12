# Independent review: Vite locale-function packing

Review target: the working-tree candidate based on first-draft commit `5bee6a9`, including the sorted-edit fix and final per-locale packing threshold, exercised through the refreshed `.real-apps/packed-compiler` snapshot. The final gate packs only groups with at least 16 eligible helpers and at least two distinct text values; it does not require 16 distinct values. This report covers the compiler’s private Vite path and the post-link `renderChunk` packer. I did not change compiler code.

## Verdict

The exercised paths preserve generated message text, locale switching, per-call locale overrides, and lazy route imports. The optimizer stays internal to Vite `locale-modules` builds; normal `compile` and `compileProject` calls keep their standard output, and the package root does not expose the internal Vite wrappers. It does not add a compiler flag or change message calls.

The chunk-level direct-`eval` bailout is required for correctness. I built a Vite fixture where `src/eval-reader.ts` contains `eval("__paraglide_locale_fn_l2_65_6e_n0")`, while a separate entry imports a generated message helper. Vite flattened both source modules into one output chunk. Without packing, the eval read the private helper and returned a function whose call produced `Add`; with packing enabled, the packer logged `bail/no change` and the result was identical. Original source-module boundaries do not protect compiler bindings after Vite links the chunk. A separate lazy chunk that has no private helper name does not enter the packer.

The fixture was built both ways with:

```text
EVAL_MODE=baseline node ../../benchmark/node_modules/vite/bin/vite.js build --config vite.eval.config.js
EVAL_MODE=packed node ../../benchmark/node_modules/vite/bin/vite.js build --config vite.eval.config.js
```

The final DrawDB Vite 8.1.0 main artifact is the unchanged fallback: root measured the same SHA-256 for baseline and candidate (`c74d3833f0b73115ad368cbf148c767c990090ed2593c3b0575cd595c0bb1c71`) and the same 3,165,434 gzip bytes. This candidate therefore has no measured DrawDB main-chunk reduction and does not establish the requested whole-app gate. Keep the earlier tuple candidate’s rejected result separate: it measured 3,166,787 gzip bytes versus 3,165,434 for its baseline (+1,353 bytes, +0.043%). The tuple result is not evidence for or against this function candidate.

## Correctness and integration checks

I ran the focused compiler, plugin, generated-output, and packer suites against the current source:

```text
pnpm exec vitest run \
  src/bundler-plugins/locale-function-packer.test.ts \
  src/bundler-plugins/unplugin.test.ts \
  src/compiler/compile-project.test.ts \
  src/compiler/output-structure/locale-modules.test.ts

Test Files  6 passed (6)
Tests       134 passed | 4 skipped (138)
```

The final independent run covered `locale-function-packer.test.ts`, `unplugin.test.ts`, `compile-project.test.ts`, `locale-modules.test.ts`, the CLI compile command tests, and `compile.test.ts`. `pnpm exec tsc --noEmit` passed. The focused cases cover group sizes and distinct-text gating, direct literal/template helpers, escaped or exported helpers, writes and aliases, side-effect ordering, nested candidate calls, hoisted reads, malformed helper names, dynamic scope, static-locale output, fallback markup, `.parts()`, and the Vite hook.

I also compared 64 static DrawDB message functions across all 51 generated locales: 3,264 baseline/candidate calls, zero text mismatches. This confirms literal parity for that set; it is not an all-message-kind or all-key parity run.

The refreshed Vite 6.4.1 build of the small client fixture now includes 16 static message calls. The inspector logged both private helpers and a packed row in the entry chunk; the lazy route remained a separate chunk with neither marker. I verified both emitted maps parse as v3 maps with nonempty mappings and embedded source content: entry map 5 sources / 6,475 mapping characters; route map 1 source / 38 mapping characters. This checks map structure and code splitting, not exact original-column tracing.

Headless Chromium verified the current build through `en → de → en`, message text for greeting and all 16 static messages, an explicit `{ locale: "de" }` call, and the lazy route in English and German. The override stayed German after the active locale returned to English; there were no page errors.

With Vite `build.minify: false`, the compiler used standard generated messages and the packer produced no rewrite. `messages/en.js`, `messages/de.js`, `_index.js`, and message barrels matched the direct-compile baseline in the scratch fixture. Only `README.md` and `runtime.js` differed between the generated directories.

## Size matrix before the final threshold

This historical matrix was measured before the final ≥16 / ≥2-distinct-values guard and motivated raising the threshold. It used the actual DrawDB generated catalog, importing the first 2, 4, 8, 16, 32, or 64 static message functions with Vite 6.4.1 and Vite 8.3.0 plus esbuild production minification. At that time the packer applied to every size. Sizes sum emitted JavaScript; gzip is level 9 and Brotli is quality 11. Each cell is standard compiler baseline → packed.

Each graph uses `MATRIX_SIZE=N`, `MATRIX_MODE=baseline|packed`, and `MATRIX_VITE=6|8` with `.real-apps/luna-size-matrix/vite.matrix.config.js`; for example:

```text
MATRIX_SIZE=16 MATRIX_MODE=packed MATRIX_VITE=6 node ../../benchmark/node_modules/vite/bin/vite.js build --config vite.matrix.config.js --logLevel silent
```

| Vite  | Helpers |         Raw bytes |      Gzip bytes |    Brotli bytes |
| ----- | ------: | ----------------: | --------------: | --------------: |
| 6.4.1 |       2 |     7,781 → 7,395 |   3,518 → 3,515 |   2,771 → 2,749 |
| 6.4.1 |       4 |   12,778 → 11,703 |   4,966 → 4,743 |   3,704 → 3,506 |
| 6.4.1 |       8 |   23,070 → 20,592 |   7,589 → 6,977 |   5,475 → 4,901 |
| 6.4.1 |      16 |   43,573 → 38,585 | 12,948 → 11,500 |   9,205 → 7,769 |
| 6.4.1 |      32 | 118,106 → 108,250 | 37,336 → 33,420 | 27,861 → 23,990 |
| 6.4.1 |      64 | 214,908 → 195,292 | 65,687 → 56,091 | 48,914 → 40,482 |
| 8.3.0 |       2 |     8,112 → 7,631 |   3,653 → 3,645 |   2,850 → 2,851 |
| 8.3.0 |       4 |   13,211 → 11,939 |   5,105 → 4,879 |   3,827 → 3,600 |
| 8.3.0 |       8 |   23,707 → 20,829 |   7,738 → 7,117 |   5,686 → 4,996 |
| 8.3.0 |      16 |   44,618 → 38,822 | 13,116 → 11,651 |   9,393 → 7,886 |
| 8.3.0 |      32 | 119,967 → 108,486 | 37,544 → 33,599 | 28,177 → 24,148 |
| 8.3.0 |      64 | 218,401 → 195,528 | 65,862 → 56,291 | 49,199 → 40,782 |

Two helpers were effectively neutral in this catalog matrix, while separate two- and three-helper fixtures regressed by 9 and 4 gzip bytes. Four helpers showed repeatable savings in the DrawDB graph, but the 10% range appeared only at 16 or more helpers. The final gate is more conservative: at least 16 eligible helpers in a locale group and at least two distinct returned strings. The distinct-values condition means 16 helpers with only one unique text are skipped.

## Final threshold verification

I rebuilt the same graphs with the final snapshot and also built each candidate graph once without the packer hook. For sizes 2, 4, and 8, Vite logged `no change`; the hooked and no-hook candidate JavaScript had identical SHA-256 content and exactly matching raw/gzip/Brotli sizes. At 16, 32, and 64 helpers, both Vite versions logged `applied` and removed the private helper names. The table compares no-hook candidate output → final gated output:

| Vite  | Helpers |         Raw bytes |      Gzip bytes |    Brotli bytes | Result                  |
| ----- | ------: | ----------------: | --------------: | --------------: | ----------------------- |
| 6.4.1 |       2 |     7,781 → 7,781 |   3,521 → 3,521 |   2,755 → 2,755 | byte-identical; skipped |
| 6.4.1 |       4 |   12,778 → 12,778 |   4,973 → 4,973 |   3,777 → 3,777 | byte-identical; skipped |
| 6.4.1 |       8 |   23,070 → 23,070 |   7,597 → 7,597 |   5,514 → 5,514 | byte-identical; skipped |
| 6.4.1 |      16 |   43,573 → 38,585 | 12,959 → 11,500 |   9,156 → 7,769 | packed                  |
| 6.4.1 |      32 | 118,106 → 108,250 | 37,387 → 33,420 | 27,829 → 23,990 | packed                  |
| 6.4.1 |      64 | 214,908 → 195,292 | 65,671 → 56,091 | 48,886 → 40,482 | packed                  |
| 8.3.0 |       2 |     8,112 → 8,112 |   3,659 → 3,659 |   2,880 → 2,880 | byte-identical; skipped |
| 8.3.0 |       4 |   13,211 → 13,211 |   5,110 → 5,110 |   3,865 → 3,865 | byte-identical; skipped |
| 8.3.0 |       8 |   23,707 → 23,707 |   7,740 → 7,740 |   5,652 → 5,652 | byte-identical; skipped |
| 8.3.0 |      16 |   44,618 → 38,822 | 13,121 → 11,651 |   9,401 → 7,886 | packed                  |
| 8.3.0 |      32 | 119,967 → 108,486 | 37,542 → 33,599 | 28,104 → 24,148 | packed                  |
| 8.3.0 |      64 | 218,401 → 195,528 | 65,859 → 56,291 | 49,206 → 40,782 | packed                  |

The baseline used for the equality claim is the same Vite-helper candidate built without the packer, so generated-module naming differences do not contaminate the check. Root’s full DrawDB baseline/candidate hash equality separately confirms no whole-app output change there.

## Remaining compatibility notes

- Direct imports from a generated locale file retain the same export keys, but function `.name` is different: `choice_a.name` is `"choice_a"` in standard output and `"__paraglide_locale_fn_l2_65_6e_n0"` in the Vite helper output. The normal `messages.js` API works as expected. If direct per-locale function names are part of the supported contract, preserve or explicitly account for this observable difference.
- The old two-helper gate could add a few compressed bytes in a small locale set. The final 16-helper/two-distinct-value guard skips small and identical-only groups. I verified that groups of 2, 4, and 8 produce byte-identical JavaScript to a no-hook build of the same Vite-helper inputs; groups of 16, 32, and 64 pack under both tested Vite versions.
- Cache keys and persistent cache paths include the Vite helper-mode bit in source review. I did not stress-test simultaneous plugin instances using different modes.
- This review exercises Vite 6 and 8 with client bundles. It is not an SSR/framework-adapter survey, and it does not replace the whole-app DrawDB/Memos Vite gate.
