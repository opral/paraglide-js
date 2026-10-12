# Luna review: client-split facade tree shaking

Reviewer: GPT-6 Luna, extra-high reasoning. This is an isolated production-build experiment against the PR4 client-split source. I did not modify compiler source or the measured application distributions. The prototype wraps only namespace initialization in a `/*#__PURE__*/` IIFE; it does not change generated message functions, locale payloads, dispatch, or public export names.

## Finding

`createMessageFacade` in `src/bundler-plugins/client-locale-split/vite-plugin.ts` emits all message wrappers, then constructs `m` at module top level by assigning every wrapper to a null-prototype object, tagging it `Module`, and freezing it. When the consumer imports two named messages, Rollup still retains all 512 message wrappers because the exported `m` object is initialized at module scope. Wrapping that object construction and freeze in a pure IIFE lets both Vite's Rollup production build and Vite's Rolldown production build discard the unused namespace and wrappers.

For the 512-message fixture, the Vite 7.3.1 entry falls from 51,462 to 520 raw bytes and from 2,603 to 246 Brotli bytes. The Vite 8.1.4 entry falls from 48,371 to 499 raw bytes and from 2,658 to 238 Brotli bytes. The two directly imported functions remain; Rollup drops 511 of the facade's 513 exports (the `m` export plus 510 unused message exports). Summed over each emitted JavaScript asset compressed independently, Brotli falls from 5,546 to 3,189 bytes on Vite 7 (−42.5%) and 5,642 to 3,222 bytes on Vite 8 (−42.9%).

The four non-entry JavaScript assets are byte-for-byte identical within every baseline/prototype pair, including the core, base and secondary locale chunks, and preload helper. This is facade-only pruning. It does not prune locale catalog payloads. The matrix contains every asset size and SHA-256 digest, rendered export counts, runtime results, and exact deltas.

| Vite | Consumer | Entry Brotli, current → IIFE | All emitted JS Brotli, current → IIFE | Rendered facade exports |
| --- | --- | ---: | ---: | ---: |
| 7.3.1 | two named functions, one rich `.parts()` call | 2,603 → 246 B | 5,546 → 3,189 B | 513 → 2 |
| 8.1.4 | two named functions, one rich `.parts()` call | 2,658 → 238 B | 5,642 → 3,222 B | 513 → 2 |
| 7.3.1 | enumerated `m` plus runtime-computed `m[key]` calls | 2,777 → 2,850 B | 5,720 → 5,793 B | 513 → 513 |
| 8.1.4 | enumerated `m` plus runtime-computed `m[key]` calls | 2,955 → 2,919 B | 5,939 → 5,903 B | 513 → 513 |

For the full namespace control, compressed-size changes of a few dozen bytes move in opposite directions between versions; the IIFE provides no material reduction when the consumer enumerates and indexes `m` dynamically. That is the expected boundary: retaining all namespace properties retains the wrappers.

## Semantics and limits

The Vite-built runtime probes match between the two facade shapes for both consumer modes. The full namespace check preserves its 512-key order, null prototype, frozen state, `[object Module]` tag, named-export aliases, and message behavior. The direct generated-module check also confirms the `m` property descriptors and that the rich function's `.parts` property remains enumerable, writable, and configurable; the rich text and parts tree are unchanged.

The fixture has 511 literal static messages and one rich message with a `.parts()` function, split across `en` and `de`. It uses Vite's default production minifier and `build.target: "es2022"`. The runtime content probe selected the English messages. This isolates tree-shaking behavior; it does not model full application startup, browser transfer, language switching, SSR, or optimized i18next. Compressed totals sum independently compressed emitted JS resources and are not route-requested-byte measurements.

This is a plausible narrowly scoped improvement for the client-split facade when a consumer uses named imports. It is not evidence that the client-split strategy beats optimized i18next, and it does not help consumers that keep a fully dynamic `m` namespace alive. A separate issue, [Paraglide issue #668](https://github.com/opral/paraglide-js/issues/668), concerns native Vite/SvelteKit barrels and route-union payloads. The project owner's latest reproduction notes that named barrels and `sideEffects: false` do not prune that shared route payload, while per-message imports do. That issue is separate from this split-only IIFE experiment and from the i18next comparison gate. A future experiment could rewrite statically known `m.foo()` or `m["foo"]()` consumer references to per-message imports while leaving genuinely dynamic access on the namespace; it would need its own semantic and whole-route validation.

## Reproduction artifacts

- `benchmark/real-apps/facade-tree-shake/run.mjs` creates the fixture and runs the eight Vite 7/8 baseline/prototype builds. The full-namespace branch selects a non-default message through runtime globals so the access remains computed.
- `benchmark/real-apps/facade-tree-shake/namespace-iife.patch` records the exact prototype source change.
- `benchmark/real-apps/facade-tree-shake/matrix.json` records pinned source/plugin hashes, each build's emitted JS sizes and hashes, rendered facade counts, compressed totals, runtime probes, and baseline/prototype comparisons.
- `benchmark/real-apps/facade-tree-shake/check-api.mjs` executes the generated facade directly and compares the full namespace API descriptors.
- `benchmark/real-apps/facade-tree-shake/api-snapshot.json` records that namespace comparison, including the key-order digest and `.parts` descriptor.

The tested source was `createMessageFacade` from PR4 commit `5ea1e5977a0d3157b94f29eeef857f4a4b143e9a`; that source file is unchanged through the measured checkout. Exact Vite versions, plugin/dist hashes, compression settings, file digests, and outputs are in the matrix. Re-run with `node benchmark/real-apps/facade-tree-shake/run.mjs` and `node benchmark/real-apps/facade-tree-shake/check-api.mjs` in an environment with the recorded Vite paths and PR4 package checkout.
