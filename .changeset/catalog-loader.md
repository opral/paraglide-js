---
"@inlang/paraglide-js": minor
---

Compile directory projects through the SDK's stateful `createCatalogLoader()` when available, bypassing database import, commits, and nested-message queries. Reuse the loader through `previousCompilation`, apply complete reset/update batches, and discard consumed sessions after compilation or publication failure so retries start safely. `compileCatalog()` accepts detached settings and bundles; `compileProject()` and older published SDKs remain supported. The unreleased snapshot loader is replaced.

SDK-only unchanged reloads at 13,300 keys across three locales measured 2.3 ms versus 103.2 ms for the previous snapshot loader (about 98% less time; five-run medians on Node 24.22.1). Edited reloads still use the full importer and can cost more than the previous API; those SDK-only results predate the selective compiler output reuse described below. See the SDK's `benchmarks/catalog/stateful` results and limitations.

Add opt-in `messageModuleSize` grouping for `message-modules` output, including `--message-module-size` in the CLI. Groups share message dispatch and types while retaining named exports, input types, metadata, documentation, and per-message tree shaking. The default remains one message per file; grouping changes direct generated module paths, so import messages through `messages.js`.

Defer database SDK, UUID, initialization, and optional config-loader work until needed. The catalog path requires the updated SDK and retains the existing plugin API and offline-cache behavior. Earlier fresh-build measurements for catalog loading and grouping remain recorded in `benchmark/project-catalog/round3/no-v2`; those predate the stateful loader refactor.

Reuse unchanged generated output and hashes through `previousCompilation`. With the default one-message-per-module layout, translation and input edits compile only changed bundles. Settings, plugin, key-set, option, grouped-layout and locale-layout changes use the full emitter as needed; unchanged catalogs reuse output for all layouts. Serialize concurrent compiles through failure recovery and invalidate previous disk hashes after failed publication, so retries restore missing files. Clear Vite transform caches before reloading after compilation errors to serve recovered translations immediately.

In a separate end-to-end benchmark at 13,300 keys across three locales, unchanged recompiles fell from 176.3 ms to 23.6 ms; translation edits from 258.9 ms to 159.7 ms; subsequent distant edits from 274.7 ms to 123.0 ms. These compare against the saved stateful-loader implementation before selective generation, not the published SDK. Fresh builds measured 1,315.9 ms versus 1,421.6 ms; edited files still pass through the SDK's full importer. See `benchmark/project-catalog/incremental` for five-run medians, raw data, validation and limitations.
