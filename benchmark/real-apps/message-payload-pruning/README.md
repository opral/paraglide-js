# Dynamic locale projection probe

This probe records a bundler capability, not a Paraglide implementation or an app-level A/B result. It uses Ntfy's pinned Inlang catalog (473 message IDs across 51 locales, base `en`) to see whether Vite removes unselected named exports from dynamically imported locale modules.

The fixture compares generic locale dispatch, direct static property reads, immediate `import(...).then(namespace => namespace.key)` projections, a 32-key projection, and namespace enumeration. Each generated entry executes and asserts its values against the source catalog. A second fixture compares named message functions with an array-backed synthetic payload; those generated layouts are deliberately simplified and do not represent production output.

## Result

With Vite's default output settings, generic locale dispatch retains all 473 exports from each selected locale on Vite 7.3.1, 8.1.4, and 8.3.4. An awaited namespace followed by a static property read also retains all exports. An immediate `.then(namespace => namespace.key)` projection prunes to one export per locale on Vite 8.1.4 and 8.3.4, and a 32-key projection retains 32. Vite 7.3.1 retains all 473 in both shapes. Namespace enumeration retains all messages on every version. Vite 7.3.1 with `preserveEntrySignatures: "allow-extension"` also retained all 473.

With the same base and French locale modules selected, Vite 8.3.4's literal one-key projection produced 967 bytes Brotli-Q11 for the initial JS chunks, versus 15,551 bytes for the generic dispatcher followed by a property read. This measures generated fixture files only. It does not include HTML, headers, browser timings, application dependencies, localization-engine costs, or a real app route. Treat it as evidence that one Rollup-family output shape can expose liveness, not as a user-visible performance win.

The synthetic 512-message/two-locale shape confirms that the representation matters: array-backed data and named values produced different chunk totals. Those strings are artificial, so the result is not an estimate for real catalogs. See [synthetic-512x2.json](results/synthetic-512x2.json).

The current evidence is insufficient for a compiler change. The useful shape is Vite-version-sensitive, and dynamic `m` access or namespace escape must retain the complete API. A production design would need real compiler output, safe scope analysis, all existing message semantics, SSR coverage, and a qualifying app-route measurement.

## Private plugin prototype against compiled Ntfy messages

An isolated compiler prototype adds `experimentalClientMessageProjection` to its Vite plugin. This option is not present in the product source shipped by this draft. A small fixture compiles five real Ntfy message IDs (`k0`, `k107`, `k110`, `k113`, `k115`) for `en`, `fr`, and `de`. It exercises literal text, interpolation, plural markup, rich `.parts`, a lazy route loaded after startup, and `fr → de → en → fr` switching. This is a compiler/plugin integration smoke test, not the Ntfy product UI or a native-i18next A/B.

The fixture passes visible-text and locale-switch checks, including an initial French render and the lazy route's French, German, and English values. It also verifies the callable-`then` dynamic-import hazard using a message projection that exports only `default`, the public `m` and `default` namespace keys, no-argument calls, function arity, and `.parts` behavior.

The first facade-level top-level-await design failed in a real Vite build: the bundler placed startup in the shared core chunk, so it ran before entry-level wrapper registration. The prototype now registers each used message wrapper and awaits that message's base and active locale in the wrapper module itself. This fixes cold startup and lazy registration, but the request graph is too fragmented to be a viable optimization: four eager messages make 16 initial requests (8 per-message/locale facade chunks, 2 shared locale projection chunks, 2 locale-function chunks, 1 registry, 2 app/runtime chunks, and HTML). Their compressed initial fixture graph is 6,576 bytes Brotli Q4. Activating the fifth lazy message makes 3 more requests; switching to German makes 7 more. A shared group chunk reduces duplicated payload, but cannot remove the dynamic-entry facade file for each message and locale.

This result does not qualify against the optimized-native gate: the fixture has only five extracted catalog entries, no complete product route, no i18next baseline, and no user metric comparison. The next useful architecture is a route- or consumer-scoped aggregate that knows the set of statically reachable keys and emits one locale payload per consumer; the generic namespace path must continue to retain all keys. This prototype should not be presented as a production improvement or opened as a product PR.

## Indexed aggregation prototype

Private commit `728f4300485de3dfb85b9d200183e2039f601d19` adds the prototype option `experimentalClientMessageAggregation`; this option is not published in this draft. It keeps a single indexed payload per locale and creates a wrapper module per message. After bundler tree shaking, `renderChunk` reads the all-chunks module graph, computes the global union of live wrapper indexes, and uses AST edits plus sourcemaps to leave unused payload slots sparse. The runtime validates every live slot before exposing the locale. Dynamic namespace access keeps all messages. The default-only locale facade also avoids the callable `then` namespace/Promise assimilation hazard.

The prototype was built with Ntfy's real 473-key catalog and Vite 8.3.4/Rolldown. The functional fixture uses five static messages, a lazy route, rich `.parts`, plural and interpolation messages, and French/German/English switching. On the same 473-key catalog, aggregation requests 9 resources and transfers 5,889 Brotli-Q4 bytes on the initial route; standard locale splitting requests 8 resources and transfers 21,468 Brotli-Q4 bytes. Browser checks passed for visible translations, lazy route activation, and locale switching. This is a small static-consumer fixture, not a product-route result.

The real Ntfy `/login` adapter path uses dynamic namespace access, so all 473 messages remain live. One cold diagnostic pair against optimized i18next measured 377,694 versus 383,115 encoded route bytes (1.414% lower) and 1,416 versus 1,424 ms to translated UI readiness (0.56% lower), with 20 versus 14 requested resources. It is far below the requested 10% gate and is not a repeated timing qualification; the static splash dominates FCP/LCP. The adapter is a benchmark-only migration, not a claim of a supported whole-app conversion. See [summary](results/ntfy-full-app-aggregation-summary.json), [raw browser capture](results/ntfy-full-app-aggregation-smoke.json), and [artifact manifest](results/ntfy-full-app-artifact-manifest.json).

The liveness set is global to the build. If a lazy route uses a key, that key remains in the selected locale payload requested by the first route; this does not solve per-route retention such as the issue discussed in [#668](https://github.com/opral/paraglide-js/issues/668). Namespace enumeration or dynamic `m[key]` access also retains the full public message surface. Vite 8.3.4/Rolldown `output.codeSplitting.groups` and the all-chunks `renderChunk` metadata were the only tested integration. Vite 7 and other Rollup/Vite versions are unsupported/unverified; when all-chunks metadata is absent the prototype fails closed rather than emitting an unpruned result. The code remains an isolated experiment, not a supported API or product PR.

A separate `sourcemap: true` fixture build traced retained dynamic French message code to `messages/fr.js` and app callsites to `main.js`; the suspected lost caller mapping was not reproduced. A static literal synthesized from compiler metadata has no original source position because that metadata does not carry source locations. See [the mapping probe](results/ntfy-plugin-aggregation-sourcemap.json).

The complete aggregate implementation is preserved in [aggregate-prototype.patch](aggregate-prototype.patch), including the earlier projection scaffolding. It applies to the product source in this draft (`git apply --check` passed). Apply it only in an isolated checkout of this draft, install its locked dependencies, and run `pnpm run env-variables` followed by `pnpm exec tsc --build`. The script loads `dist` from its own checkout, so run it from that rebuilt isolated checkout; the unmodified product compiler does not support these prototype flags. Do not apply both prototype patches together. See also [Luna’s review](luna-aggregate-review.md).

After preparing the pinned Ntfy catalog, run both modes from that isolated checkout:

```sh
NTFY_PROJECTION_SOURCE=/path/to/ntfy/web \
NTFY_SOURCE_COMMIT=211ba22860d7483073a8ce13dcda5f467194989b \
NTFY_ALL_MESSAGES=1 NTFY_PROJECTION_MODE=split \
  node benchmark/real-apps/message-payload-pruning/build-ntfy-projection-fixture.mjs

NTFY_PROJECTION_SOURCE=/path/to/ntfy/web \
NTFY_SOURCE_COMMIT=211ba22860d7483073a8ce13dcda5f467194989b \
NTFY_ALL_MESSAGES=1 NTFY_PROJECTION_MODE=aggregation \
  node benchmark/real-apps/message-payload-pruning/build-ntfy-projection-fixture.mjs
```

The script's default remains the five-key fixture; `NTFY_ALL_MESSAGES=1` uses every message ID in the English catalog. Raw mode outputs are [aggregation](results/ntfy-plugin-aggregation.json) and [standard split](results/ntfy-plugin-split.json). The aggregation result records the compiler source commit and source diff digest, public entry and implementation leaf hashes, built tree hashes, browser-request graph, and visible values.

### Reproduce the plugin fixture

Install this worktree's dependencies (`npm ci`) and check out Ntfy at `211ba22860d7483073a8ce13dcda5f467194989b` with its dependencies installed. Convert its native catalogs using this worktree's adapter, then run the fixture:

```sh
npx tsc --build --pretty false
NTFY_WEB_ROOT=/path/to/ntfy/web \
PARAGLIDE_REPO_ROOT=/path/to/paraglide-vite-message-projection \
  node benchmark/real-apps/prepare-ntfy.mjs
NTFY_PROJECTION_SOURCE=/path/to/ntfy/web \
NTFY_SOURCE_COMMIT=211ba22860d7483073a8ce13dcda5f467194989b \
  node benchmark/real-apps/message-payload-pruning/build-ntfy-projection-fixture.mjs
```

The script reads the Ntfy web directory supplied by `NTFY_PROJECTION_SOURCE`, extracts five catalog entries into a temporary three-locale project, uses that checkout's Vite and Playwright installs, builds via the public `paraglideVitePlugin` API, runs a no-throttling functional browser check, and writes its durable raw report to [ntfy-plugin-projection.json](results/ntfy-plugin-projection.json). The measured environment used Node 22.23.2 and Vite 8.3.4. The exact build output is retained under `.real-apps/ntfy-message-projection-fixture/dist` with per-resource hashes and a canonical tree hash in the report. The report counts browser-requested resources before lazy activation separately from the manifest's all-dynamic-chunks reachability bound. It does not record timing or claim a Core Web Vital improvement.

The rejected per-message implementation is also preserved in [per-message-prototype.patch](per-message-prototype.patch), based on the same product source as this draft. Apply it only in an isolated compiler checkout, then rebuild that checkout before running the compiled fixture. The prototype flag is not part of the source shipped by this draft.

## Reproduction

Use Ntfy source commit `211ba22860d7483073a8ce13dcda5f467194989b`, Vite 7.3.1, Vite 8.1.4, and Vite 8.3.4. The `project.inlang/messages` input is benchmark-generated, not checked into native Ntfy. In an isolated Ntfy checkout with its pinned dependencies installed, first run `NTFY_WEB_ROOT=/path/to/ntfy/web node benchmark/real-apps/prepare-ntfy.mjs` to convert the native catalogs. This projection probe exports those catalog values as data; it does not execute compiled plural or markup functions. Set the following paths to the checked-out catalog and each Vite package's `dist/node/index.js`:

```sh
export NTFY_MESSAGES_DIR=/path/to/ntfy/web/project.inlang/messages
export NTFY_SOURCE_COMMIT=211ba22860d7483073a8ce13dcda5f467194989b
export VITE7_NODE_ENTRY=/path/to/vite-7/node_modules/vite/dist/node/index.js
export VITE81_NODE_ENTRY=/path/to/vite-8.1/node_modules/vite/dist/node/index.js
export VITE83_NODE_ENTRY=/path/to/vite-8.3/node_modules/vite/dist/node/index.js
node benchmark/real-apps/message-payload-pruning/direct-projection-probe.mjs
node benchmark/real-apps/message-payload-pruning/static-dynamic-pruning-probe.mjs
```

The scripts write generated projects and raw results under `.real-apps/message-payload-pruning/` in the current working directory. To rerun only selected cases, set `PROBE_VERSIONS`, `PROBE_SHAPES`, and optionally `PRESERVE_ENTRY_SIGNATURES`. [ntfy-vite-default.json](results/ntfy-vite-default.json) and [ntfy-vite7-allow-extension.json](results/ntfy-vite7-allow-extension.json) contain the archived raw size summaries for the catalog fixture. Compression uses gzip level 9 and Brotli quality 11; route totals sum the per-file compressed sizes instead of recompressing concatenated chunks.

## Files

- [direct-projection-probe.mjs](direct-projection-probe.mjs) builds the real-catalog cases and asserts their values.
- [static-dynamic-pruning-probe.mjs](static-dynamic-pruning-probe.mjs) builds the synthetic layout cases and asserts output values.
- [ntfy-vite-default.json](results/ntfy-vite-default.json) records the default Vite matrix.
- [ntfy-vite7-allow-extension.json](results/ntfy-vite7-allow-extension.json) records the Vite 7 signature-preservation control.
- [synthetic-512x2.json](results/synthetic-512x2.json) records the synthetic representation control.

## Selected-only startup probe

The [selected-only startup experiment](selected-startup-results.md) omits the base module from a small French fixture’s initial graph, reducing 8 requests to 7 and 21,557 to 15,552 Brotli-Q4 bytes. It later fetches English when needed and changes the preload contract for per-call English overrides. This is deferred fixture transfer, not a production page or timing win; its source remains an unapplied patch.
