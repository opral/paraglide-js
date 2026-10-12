# Private route capsule V2: gate before module evaluation

V2 resolves the demonstrated lazy-module retry failure in the private V1 fixture. It remains an isolated compiler/bundler experiment, with the complete 473-key Ntfy catalog as input. It is not a whole-product A/B, supported API, or qualifying performance PR.

Apply [the complete V2 patch](route-capsules-v2-prototype.patch) alone to source `6997d020813d76f087d585110e62cd54891726e0`; it includes aggregation scaffolding and replaces the earlier capsule implementation. Do not stack both archived patches. Rebuild that isolated compiler before running the fixture. The implementation leaf is `5521cb44cc2ea8c6458e5bb3f8ac9a9f24e728d91d02cfc0d22f689051a1b336`; the full patch digest and source hashes are in [the summary](results/route-capsules-v2-summary.json).

The rendered-chunk graph identifies the static capsule groups needed by a literal application `import()` target and its static dependencies. `renderChunk` rewrites that import to await the groups before executing the original import. A failed data gate rejects the caller's promise while leaving the target module unevaluated; a subsequent import attempt can retry the data fetch. Compiler core and locale imports are excluded. Existing Vite preload handling remains around the import callback, so target JS can download in parallel with the data gate.

The retained fault probe returns HTTP503 for a French lazy capsule. Attempt one rejects with `Capsule HTTP 503` and the lazy evaluation counter remains zero. Attempt two succeeds, the counter becomes one, and French `5 MB par fichier` appears. V1's second import remained rejected by cached ESM evaluation failure. Clearing a fetch promise alone did not repair V1; moving the gate before evaluation is the concrete behavioral change. Initial module startup still uses TLA, and a failed initial evaluation is not made recoverable by this prototype.

A plugin-instance random nonce protects compiler markers, and each live wrapper must contribute exactly one expected marker. User JS containing the old predictable marker string remains unchanged. A deliberately forged same-nonce duplicate fails the build before output rather than substituting user text. The nonce disappears completely after rewriting. The runtime gate uses a stable metadata digest instead of a random key: two independent fresh builds produce byte-identical output files and manifests, tree SHA `2aed261d242153932c203360790a0fd389bf28df75a8ccbe895a6c019d80cde5`. See [determinism](results/route-capsules-v2-determinism.json).

Groups have stable IDs from their sorted wrapper-index sets. Asset URLs cannot provide identity: two groups with formatted English and static French/German can both emit the same content-deduplicated empty English JSON asset. The regression produces that condition for initial `k0` and lazy `k1`. Both groups remain registered, and switching to German requests both distinct German capsules. Empty groups skip JSON fetches. Existing mixed static/function locale duplication still retains one static copy per affected shared locale JS; the regression records those two copies, rather than claiming complete extraction.

Each descriptor also carries expected static indices. HTTP200 `{}` in place of a required German capsule rejects before locale commit, keeps the visible French state, and succeeds on retry with the valid data. This is distinct from HTTP503 handling and prevents silently treating an incomplete capsule as loaded.

The normal three-locale fixture requests 11 resources and 6,663 Brotli-Q4 bytes initially. V1's corresponding captured graph was 6,417 bytes; V2 adds a gate, stable group identity, and validation. This difference is not a claimed optimization. A single unthrottled resource trace starts lazy JS at 37.2 ms and the English/French capsule requests at 37.5 ms, showing parallel fetching in this fixture; it is not a page-load metric or repeated timing result.

The full success sequence passes for English base, German base, and a German/French-only project without an English property: visible text, rich parts, plural/interpolation, lazy import, switching, explicit preload before lazy import, and concurrent switching/lazy activation. Decoded JS extraction checks now include both string `Literal` and static `TemplateLiteral` nodes; Vite uses backticks for some output strings. The earlier Literal-only probe was narrower, although independent raw exact-text checks already established the fully static `k1` result. V2's mapping probe still traces `window.activateLazyRoute` to `src/main.js:20` and French rich text to `messages/fr.js:550:42`. Static metadata text has no original source location.

`buildStart` clears metadata, emitted asset references, and the preload reference on every build. Watch behavior itself is unverified. The private option explicitly rejects development servers and uses the actual build hook's `this.meta.viteVersion` to require Vite 8.3.4, plus the fourth-argument rendered graph check. This is host context, not the compiler's Vite dependency: the compiler checkout has Vite 8.1.4. A product implementation would need equivalent development behavior and tested host support; this private guard does not satisfy agent experience requirements for a public feature.

Current limits include computed dynamic imports, unusual manual chunk placement, multiple HTML entries, shared-chunk cycles, arbitrary base/CDN URLs, global gate collisions between independently built projects, watch behavior, SSR execution, and initial startup failure recovery. Dynamic namespaces remain conservative. No actual product-route gate was measured, and no product source was published.

Reproduce a normal V2 run:

```sh
NTFY_PROJECTION_SOURCE=/path/to/ntfy/web \
NTFY_SOURCE_COMMIT=211ba22860d7483073a8ce13dcda5f467194989b \
NTFY_PROJECTION_MODE=aggregation NTFY_RUN_TAG=-gate-v2-final-a \
NTFY_CAPSULE_RECOVERY=1 \
  node benchmark/real-apps/message-payload-pruning/build-route-capsule-fixture.mjs
```

Use a distinct `NTFY_RUN_TAG` for each fresh build. Add `NTFY_BASE_LOCALE=de` and optionally `NTFY_FIXTURE_LOCALES=fr,de` for base coverage. `NTFY_MIXED_GROUPS=1` mutates the two English keys solely for the registry regression; those reports are marked as functional catalog mutations. `NTFY_MARKER_COLLISION=1` injects an app JS marker literal without changing catalogs. `NTFY_FORGED_MARKER_COLLISION=1` expects a rejected build. `NTFY_CAPSULE_INVALID_PAYLOAD=1` injects incomplete HTTP200 data. `NTFY_SOURCEMAP=1` writes a separate mapped build. The generator retains the same complete catalog input in every variant.

TypeScript compilation, syntax/diff checks, and these full fixture runtime assertions pass. The older aggregate unit tests were not represented as coverage of V2. V1 compiler `dist` was frozen before rebuilding, and all archived V1 fixture artifacts remain untouched.
