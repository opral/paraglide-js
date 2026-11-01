---
"@inlang/paraglide-js": major
"@inlang/paraglide-js-react": patch
"@inlang/paraglide-js-solid": patch
"@inlang/paraglide-js-svelte": patch
"@inlang/paraglide-js-vue": patch
---

Remove the `additionalFiles` compiler option in Paraglide JS 3. Custom files and overrides of generated files are no longer supported through this option. Existing JavaScript configurations using it fail with migration guidance instead of silently dropping those files.

Remove `additionalFiles` from your compiler, bundler plugin, or `paraglide.config.*` options. Keep framework helpers and message re-export wrappers in your application source, outside Paraglide's generated output directory. Manage extra assets, metadata, and source maps through your own build tooling. Paraglide continues to generate declarations for its own output when `emitTsDeclarations` is enabled.

Allow Paraglide JS 3 in the framework helper packages’ peer dependency ranges.

The CLI emits declarations by default (use `--no-emit-ts-declarations` to disable them). Init explicitly enables declaration emission in generated Vite integrations, compile scripts, and its initial compilation, and no longer reads or changes `tsconfig.json` to enable `allowJs`. The programmatic compiler and bundler plugin option default remains `emitTsDeclarations: false`.

Use the SDK catalog entry point directly, removing the older SDK database-loading fallback and compatibility detection. Remove the unused deprecated `NodeishFilesystem` type. The public `createParaglide()` API remains available.
