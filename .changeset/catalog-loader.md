---
"@inlang/paraglide-js": minor
---

Use the SDK's stateful `createCatalogLoader()` for directory compilation when available. Reuse the loader through `previousCompilation`, apply complete reset/update batches, and replace the unreleased snapshot catalog integration. Existing `compileProject()`, `compileCatalog()`, older published SDKs, and offline plugin caches remain supported.

Reuse unchanged generated output and hashes. With the default one-message-per-module layout, translation and input edits compile only changed bundles. Settings, plugin, key-set, option and shared-layout changes use the full emitter as needed; unchanged catalogs reuse output for all layouts. Serialize concurrent compiles and invalidate consumed loader state and disk hashes after publication failures so retries restore missing files. Invalidate Vite's transform cache before error-recovery reloads to serve fresh translations.

Retain opt-in `messageModuleSize` grouping for `message-modules` output, including `--message-module-size` in the CLI. Groups preserve named exports, input types, metadata, documentation, and per-message tree shaking. The default remains one message per file; import grouped messages through `messages.js` because grouping changes direct generated module paths.
