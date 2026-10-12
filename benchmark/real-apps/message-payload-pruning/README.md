# Dynamic locale projection probe

This probe records a bundler capability, not a Paraglide implementation or an app-level A/B result. It uses Ntfy's pinned Inlang catalog (473 message IDs across 51 locales, base `en`) to see whether Vite removes unselected named exports from dynamically imported locale modules.

The fixture compares generic locale dispatch, direct static property reads, immediate `import(...).then(namespace => namespace.key)` projections, a 32-key projection, and namespace enumeration. Each generated entry executes and asserts its values against the source catalog. A second fixture compares named message functions with an array-backed synthetic payload; those generated layouts are deliberately simplified and do not represent production output.

## Result

With Vite's default output settings, generic locale dispatch retains all 473 exports from each selected locale on Vite 7.3.1, 8.1.4, and 8.3.4. An awaited namespace followed by a static property read also retains all exports. An immediate `.then(namespace => namespace.key)` projection prunes to one export per locale on Vite 8.1.4 and 8.3.4, and a 32-key projection retains 32. Vite 7.3.1 retains all 473 in both shapes. Namespace enumeration retains all messages on every version. Vite 7.3.1 with `preserveEntrySignatures: "allow-extension"` also retained all 473.

With the same base and French locale modules selected, Vite 8.3.4's literal one-key projection produced 967 bytes Brotli-Q11 for the initial JS chunks, versus 15,551 bytes for the generic dispatcher followed by a property read. This measures generated fixture files only. It does not include HTML, headers, browser timings, application dependencies, localization-engine costs, or a real app route. Treat it as evidence that one Rollup-family output shape can expose liveness, not as a user-visible performance win.

The synthetic 512-message/two-locale shape confirms that the representation matters: array-backed data and named values produced different chunk totals. Those strings are artificial, so the result is not an estimate for real catalogs. See [synthetic-512x2.json](results/synthetic-512x2.json).

The current evidence is insufficient for a compiler change. The useful shape is Vite-version-sensitive, and dynamic `m` access or namespace escape must retain the complete API. A production design would need real compiler output, safe scope analysis, all existing message semantics, SSR coverage, and a qualifying app-route measurement.

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
