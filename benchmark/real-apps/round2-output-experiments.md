# Round 2 output experiments

These are exploratory Vite production builds using pinned real catalog text, not qualifying product changes. The app inputs and compiler baseline are those of the third draft (`ec591218bb814c65e0a9f6a0252f8ec75236aa17`). All byte figures come after Vite tree shaking/minification, gzip defaults, and separately Brotli Q4/Q11. [Portable replay scripts](round2-experiments/README.md) are provided; heavy generated artifacts remain in ignored scratch.

## Representation experiments: 36 builds

Six rich-parts representations (baseline, text factory, tag factory, both factories, tuple expansion, numeric tuples), three real AnythingLLM message subsets, Vite 6.4.1 and 8.1.4. The scopes contain 16 rich messages, 50 messages with expressions somewhere in their translations, or a 215-message mixture. Each emitted bundle was compared to its control for text and parts at English, French, Chinese and unknown locale with sample inputs.

The best gzip reduction is only 3.6% on the rich-only scope, 2.7% on the formatted scope and 1.3% on the mixed scope. Raw-byte reductions are much larger, but are not the gate. **Rejected as >10% shipped-byte optimizations.** These checks do not establish adversarial getter/coercion behavior or production route performance.

## Selective string pooling: 39 builds

For DrawDB, Memos and AnythingLLM, pool repeated static matrix literals at minimum lengths 32/128/512/2048 and repetition counts 2/4/8, alongside an unmodified matrix control. All use Vite 8.1.4 here, including AnythingLLM; its own Vite 4 baseline is a separate earlier experiment. Final bundles match all included key/locale calls to their compiler control using the same sample inputs and excluding the earlier symmetric plural exclusions.

DrawDB and AnythingLLM have no gzip win; Memos peaks at 1.44%. Pooling may increase compressed bytes despite reducing raw bytes. **Rejected.** The raw result uses `minLength: null` for the baseline's infinite threshold.

## Matrix serialization: 15 builds

Three catalogs with five representations: ordinary nested literals, JSON-parsed rows, delimiter-split rows, JSON-parsed flat arrays, delimiter-split flat arrays. Flat forms rewrite retained lookup indices with the original row width. Delimiter collisions fail closed. These preserve the included control outputs, but add startup decoding work; no production CPU or page-load improvement is established. Compressed-byte improvements remain below 10%, so these are **rejected as shipped-byte candidates**. JSON and delimiter prototypes are not being added as runtime dependencies.

## Reachability bounds: 24 builds

Twelve builds manually specialize rich messages into plain text or parts, demonstrating an upper bound; this deliberately changes the experimental exports and is **not a compatible compiler implementation**. Twelve further builds use a provisional post-tree-shaking reference pass on direct-call workloads. This can remove the unused parts branch of plain calls while leaving the public call syntax unchanged in those fixtures.

On Vite 8, plain-only 16-message gzip falls 45,733→30,711 B (32.8%) in the reference-pass probe; the 215-message mixture falls 163,583→146,907 B (10.2%). The corresponding Vite 6 controls also improve. Parts-only reference pruning gains about 5%, less than its manually specialized upper bound (~21%).

**Not ready for a product PR.** The exploratory pass is not compiler-ownership/scope hardened and does not cover property writes, escaped functions, shadowed identifiers, exports, or arbitrary application graphs. Existing full AnythingLLM rich functions escape into an app-specific dynamic map, so these fixture reductions are not a whole-app result. A supported implementation must preserve API, identities and mutation behavior where observable, and receive correctness/agent review. The bounds justify further investigation, not publication as a qualified optimization.

## Raw results

The five `results/round2-*.json` files contain every completed cell, emitted sizes, and parity status. There are 114 completed production-build cells across these ablations. They are variations of several approaches across workloads, not 114 independent optimization ideas. Failed intermediate harness attempts are excluded: a parts-specialization prototype initially mishandled plain translated locales, and the dictionary harness initially attempted excluded plural keys. Both were corrected before the recorded sweeps completed. Neither failure was a compiler/SDK bug.

Automatic locale splitting and additional full native app baselines are evaluated separately. No field or all-app performance claim follows from these results.
