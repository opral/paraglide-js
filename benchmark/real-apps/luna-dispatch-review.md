# Independent dispatch-matrix review

**Reviewer:** GPT-6 Luna, extra-high reasoning. **Source:** `perf/vite-dispatch-matrices`, HEAD `8445b23b700b933d06c02f30d16a2e3ac4aeb0f6` plus the uncommitted candidate diff visible in the worktree. This review used the refreshed `dist` after the internal Vite-only compiler wrappers were added. No compiler or plugin source was edited by the reviewer.

## Findings

The generated-message behavior and package-facing API passed the checks below. The initial `>=16 helpers / >=2 locales` gate was too broad for shipped-byte safety: exact DrawDB fixtures showed regressions on small locale graphs and some short-string groups. The source now uses the stricter `>=32 eligible static dispatchers in the same chunk / >=8 locales` gate, with marker generation also suppressed when the project has fewer than 32 bundles or fewer than 8 locales.

The earlier DrawDB matrix sweep found gzip and Brotli savings for all tested 8/16-locale, 32/64-helper groups across Vite 4, 6, and 8. Final guard verification below adds two caveats: a deliberately repetitive synthetic 32-helper/8-locale fixture still regressed compressed bytes despite shrinking raw output, and a project-wide 32-bundle threshold can leave an individual 16-helper lazy chunk marked but unpacked. For that small unoptimized chunk, Vite 4/6 had tiny compression/hash churn while Vite 8 was byte-identical. The per-project threshold therefore avoids the tested low-locality cases but is not a universal compressed-byte guarantee; the three real application build gates remain the publication criterion.

The AST-only dynamic-scope guard is a correctness improvement. A large-comment fixture containing `with(` and `eval(` in comment text packed successfully; direct `eval /* comment */ (...)` and a `with` statement both caused a safe bail. This avoids the earlier comment-driven false bail while retaining the lexical-scope protection needed for direct eval. Since the new matrix bindings are module-level lexical names, a direct eval in the same chunk can observe them; I found no sound basis to narrow that bail to only “related” functions.

The Vite-only marker and packer do not add a package-facing compiler option or change generated message calls. The `compile*ForVite` helpers are absent from the package root exports and the compiler barrel; generated functions retain their normal exports and metadata. The package keeps its existing `compileBundle` and `compileProject` API.

## Byte gate sweep

I built exact values from the DrawDB baseline catalogs (`d634aa890da3d26ed44622fa4fa4818ea400084ba80d15538d5fd9d03f4d4e5f`), selecting 2, 4, 8, or 16 real locales and groups of 16, 32, or 64 fully static messages. “Short” selected English strings of at most 8 characters; “long” selected English strings of at least 20 characters. The normal `compileProject` output was the baseline; Vite output used the same `message-modules` layout, `globalVariable`/`baseLocale` strategy, and minification. I used Vite 4.5.3, 6.4.1, and 8.1.4.

| Locale count | Observed result across 16/32/64 helpers and short/long data                                                                                                                                                                                                       |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2            | Compression regressed across all tested helper/data groups on Vite 4/6; e.g. 64 short helpers added 137–164 gzip bytes. Vite 8 sometimes emitted byte-identical code after simplifying one-branch helpers. Long strings did not remove the low-locale regression. |
| 4            | Mixed. Long groups at 32/64 helpers saved compressed bytes; short groups regressed or were mixed.                                                                                                                                                                 |
| 8            | 16 short helpers were neutral or slightly worse (gzip 0–2 bytes; Brotli up to 24 bytes worse). 16 long helpers saved bytes. All 32/64-helper short and long groups saved both gzip and Brotli across all three Vite versions.                                     |
| 16           | All tested 16/32/64-helper short and long groups reduced gzip and Brotli. Even 16 short helpers saved 136–148 gzip bytes.                                                                                                                                         |

The 20-helper Vite integration fixture also shows why a helper-count threshold alone is insufficient. Its packed lazy chunk was 43–49 raw bytes smaller, but full-output gzip grew by 75–83 bytes and Brotli by 60–91 bytes across Vite 4/6/8. These three locales and short repeated messages are a deliberately small case, not a real-app gate. The complete matrix is in `.real-apps/luna-dispatch-review/matrix/matrix-results.json`; the scratch builder and exact selected key lists are in `.real-apps/luna-dispatch-review/matrix-sweep.mjs` and that result file.

## Correctness and integration checks

I ran:

```text
pnpm exec vitest run src/bundler-plugins/dispatch-matrix-packer.test.ts src/compiler/compile-bundle.test.ts src/compiler/compile-project.test.ts src/bundler-plugins/unplugin.test.ts
pnpm exec tsc --noEmit
```

Result: 117 tests passed and 4 were skipped; TypeScript passed. The formatter warning in the existing compiler tests was unrelated to this change.

I also built the same generated-message fixture with Vite 4.5.3, 6.4.1, and 8.1.4, once with normal compiler output and once with the Paraglide Vite plugin. Each build retained separate entry and lazy chunks. Chromium 143 loaded the entry before requesting the lazy chunk; the dynamic import fetched that chunk only when called. All baseline/packed browser outputs matched:

- `setLocale("en") → setLocale("de") → setLocale("en")` returned `English 0`, `Deutsch 0`, `English 0`, with `getLocale()` still `en`.
- Explicit `{ locale: "de" }` returned German while leaving the active locale at `en`. An unknown string and `new String("de")` both used the configured Spanish base, matching the baseline.
- Interpolated text returned `Hallo Ada`; markup returned `Hinweis` and the same `.parts()` structure in both builds.
- The lazy module returned all 21 expected messages after import, with no page errors.

For each Vite version, both hidden source maps had nonempty mappings and matching `sources`/`sourcesContent` counts (5 entry sources and 21 lazy sources). The normal build path emitted private markers; direct non-Vite compilation, static-locale compilation, middleware compilation, and an explicit `build.minify: false` build did not. The unminified build did not acquire packed tables.

The helper table creates one outer array and one row array per locale, with one reference slot per eligible helper in each row. For a 16-locale/64-helper group that is 16 rows and 1,024 slots allocated at module initialization, plus the selector. A headless Chromium throughput sanity check on this case, alternating explicit English/German overrides across 512,000 dynamic helper calls per sample, had identical checksums and median times of 16.7 ms baseline versus 14.3 ms packed over five samples. This is a small synthetic diagnostic, not an application performance claim. The browser exposed only a coarse 10 MB heap reading, so it did not provide a useful direct allocation delta.

No production whole-app win is claimed in this review. The three real-app Vite gates remain the publication criterion for the candidate with this stricter guard.

## Final guard follow-up

**Evaluator:** GPT-6 Luna, extra-high reasoning. I independently used the refreshed `dist` whose compiler and packer both contain the `>=32 / >=8` conditions. I built standard `compileProject` output beside the Vite-plugin output and compared minified chunk SHA-256 values, sizes, and source maps using Vite 4.5.3, 6.4.1, and 8.1.4.

For a 40-bundle project with 2 locales, a 40-bundle project with 4 locales, and a 16-bundle project with 8 locales, Vite generated no private dispatch marker. Every output chunk had the same SHA-256, raw/gzip/Brotli bytes, and filename as standard compiler output on all three Vite versions. The large-project/too-small-lazy-group case had 32 bundles and 8 locales, split into a 16-message entry and a 16-message lazy chunk. The source contained markers, but neither chunk met the 32-function packing gate. Vite 8 output was exact. Vite 4 and 6 kept the same raw byte counts but had small compressor differences: Vite 4 total gzip/Brotli changed by −4/−2 bytes; Vite 6 changed by 0/−14 bytes. Their chunk hashes changed. This is evidence of minifier/compressor naming churn from the marker binding on skipped groups; restoring marker bindings to their ordinary `locale` names when a chunk has no eligible group would be needed for exact cross-version SHA parity.

The mixed case had 64 project bundles, 8 locales, 40 static helpers in the entry chunk, and 24 in a lazy chunk. The entry was packed and shrank raw bytes by 1,859 (Vite 4/6) or 2,411 (Vite 8); the 24-helper lazy chunk was not packed and kept its raw byte count. Both chunks retained nonempty external source maps with sources and source content. This fixture is intentionally repetitive and did not compress better: total gzip/Brotli deltas were +106/+93 bytes on Vite 4, +83/+50 on Vite 6, and +36/+55 on Vite 8. A second all-in-one 32-helper/8-locale static fixture likewise regressed gzip/Brotli by +109/+32, +83/+105, and +38/+72 bytes, respectively. These constructed strings are a diagnostic for residual patterns; the real catalogs and whole-app Vite gates determine product value.

The guard matrix and exact output hashes are in `.real-apps/luna-final-guard/guard-results.json`; the build driver is `.real-apps/luna-final-guard-check.mjs`. They are ignored scratch artifacts, not product source. No package-facing compiler option was used.
