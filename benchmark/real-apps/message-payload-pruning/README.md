# Dynamic locale projection probe

This probe records a bundler capability, not a Paraglide implementation or an app-level A/B result. It uses Ntfy's pinned Inlang catalog (473 message IDs across 51 locales, base `en`) to see whether Vite removes unselected named exports from dynamically imported locale modules.

The fixture compares generic locale dispatch, direct static property reads, immediate `import(...).then(namespace => namespace.key)` projections, a 32-key projection, and namespace enumeration. Each generated entry executes and asserts its values against the source catalog. A second fixture compares named message functions with an array-backed synthetic payload; those generated layouts are deliberately simplified and do not represent production output.

## Result

With Vite's default output settings, generic locale dispatch retains all 473 exports from each selected locale on Vite 7.3.1, 8.1.4, and 8.3.4. An awaited namespace followed by a static property read also retains all exports. An immediate `.then(namespace => namespace.key)` projection prunes to one export per locale on Vite 8.1.4 and 8.3.4, and a 32-key projection retains 32. Vite 7.3.1 retains all 473 in both shapes. Namespace enumeration retains all messages on every version. Vite 7.3.1 with `preserveEntrySignatures: "allow-extension"` also retained all 473.

With the same base and French locale modules selected, Vite 8.3.4's literal one-key projection produced 967 bytes Brotli-Q11 for the initial JS chunks, versus 15,551 bytes for the generic dispatcher followed by a property read. This measures generated fixture files only. It does not include HTML, headers, browser timings, application dependencies, localization-engine costs, or a real app route. Treat it as evidence that one Rollup-family output shape can expose liveness, not as a user-visible performance win.

The synthetic 512-message/two-locale shape confirms that the representation matters: array-backed data and named values produced different chunk totals. Those strings are artificial, so the result is not an estimate for real catalogs. See [synthetic-512x2.json](results/synthetic-512x2.json).

The current evidence is insufficient for a compiler change. The useful shape is Vite-version-sensitive, and dynamic `m` access or namespace escape must retain the complete API. A production design would need real compiler output, safe scope analysis, all existing message semantics, SSR coverage, and a qualifying app-route measurement.

## Public-plugin prototype against compiled Ntfy messages

The isolated prototype in `src/bundler-plugins/client-locale-split/vite-plugin.ts` adds `experimentalClientMessageProjection` to the public Vite plugin. A small fixture compiles five real Ntfy message IDs (`k0`, `k107`, `k110`, `k113`, `k115`) for `en`, `fr`, and `de`. It exercises literal text, interpolation, plural markup, rich `.parts`, a lazy route loaded after startup, and `fr → de → en → fr` switching. This is a compiler/plugin integration smoke test, not the Ntfy product UI or a native-i18next A/B.

The fixture passes visible-text and locale-switch checks, including an initial French render and the lazy route's French, German, and English values. It also verifies the callable-`then` dynamic-import hazard using a message projection that exports only `default`, the public `m` and `default` namespace keys, no-argument calls, function arity, and `.parts` behavior.

The first facade-level top-level-await design failed in a real Vite build: the bundler placed startup in the shared core chunk, so it ran before entry-level wrapper registration. The prototype now registers each used message wrapper and awaits that message's base and active locale in the wrapper module itself. This fixes cold startup and lazy registration, but the request graph is too fragmented to be a viable optimization: four eager messages make 16 initial requests (8 per-message/locale facade chunks, 2 shared locale projection chunks, 2 locale-function chunks, 1 registry, 2 app/runtime chunks, and HTML). Their compressed initial fixture graph is 6,576 bytes Brotli Q4. Activating the fifth lazy message makes 3 more requests; switching to German makes 7 more. A shared group chunk reduces duplicated payload, but cannot remove the dynamic-entry facade file for each message and locale.

This result does not qualify against the optimized-native gate: the fixture has only five extracted catalog entries, no complete product route, no i18next baseline, and no user metric comparison. The next useful architecture is a route- or consumer-scoped aggregate that knows the set of statically reachable keys and emits one locale payload per consumer; the generic namespace path must continue to retain all keys. This prototype should not be presented as a production improvement or opened as a product PR.

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
