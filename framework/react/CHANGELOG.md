# @inlang/paraglide-js-react

## 1.0.4

### Patch Changes

- f65ba59: Remove the `additionalFiles` compiler option in Paraglide JS 3. Custom files and overrides of generated files are no longer supported through this option. Existing JavaScript configurations using it fail with migration guidance instead of silently dropping those files.

  Remove `additionalFiles` from your compiler, bundler plugin, or `paraglide.config.*` options. Keep framework helpers and message re-export wrappers in your application source, outside Paraglide's generated output directory. Manage extra assets, metadata, and source maps through your own build tooling. Paraglide continues to generate declarations for its own output when `emitTsDeclarations` is enabled.

  Allow Paraglide JS 3 in the framework helper packages’ peer dependency ranges.

  The CLI emits declarations by default (use `--no-emit-ts-declarations` to disable them). Init explicitly enables declaration emission in generated Vite integrations, compile scripts, and its initial compilation, and no longer reads or changes `tsconfig.json` to enable `allowJs`. The programmatic compiler and bundler plugin option default remains `emitTsDeclarations: false`.

  Use the SDK catalog entry point directly, removing the older SDK database-loading fallback and compatibility detection. Remove the unused deprecated `NodeishFilesystem` type. The public `createParaglide()` API remains available.

## 1.0.3

### Patch Changes

- b8af4b1: Embed TypeScript sources in published JavaScript sourcemaps and stop emitting declaration sourcemaps that reference unpublished source files.

## 1.0.2

### Patch Changes

- 5caa30d: Allow `ParaglideMessage` inputs to be omitted for messages without parameters.

## 1.0.1

### Patch Changes

- 77f2595: Republish framework packages with built `dist` artifacts so package exports resolve correctly after install.

## 1.0.0

### Patch Changes

- Updated dependencies [d1c86fb]
- Updated dependencies [90a1580]
  - @inlang/paraglide-js@2.11.0
