# Orca source-only i18n audit

This is a read-only source audit of `stablyai/orca` at `a94092908c244c0ba01fdd5bf9e53b195f4e7952`. No build, backend fixture, or browser measurement was run, so this does not establish a route-level optimization opportunity.

## Frontend and toolchain

- Web entry: `src/renderer/web-index.html`.
- Vite config: `vite.web.config.ts`; the package uses `rolldown-vite` 7.3.1.
- The package requires Node 24 and pins pnpm 12.8.1. `build:web` builds the packages, runs Vite, and verifies the generated app.
- Blob IDs: `web-index.html` `5fe93d1157f46e3312db12d25038803e25fc68d5`; Vite config `4d6d90e60bf161c834182c9c9985ef9eed810b69`; package manifest `c742c4a8433ac82bba5a0be73ced01dd7a710329`; lockfile `47a60f95403ca3296832f7c9e1cdcc805764b618`.

## Existing locale loading

The native setup is already selective. It eagerly loads the pruned `en-runtime-required.json` (151,138 bytes), and the i18next backend dynamically loads the selected non-English locale. The provider waits for application settings over IPC and then awaits `i18n.changeLanguage(locale)` before rendering. The locale map has five non-English locales (`es`, `fr`, `ja`, `ko`, `zh`); a nearby source comment says four, so the map was counted directly.

Raw catalog sizes from the pinned checkout, excluding the separate English runtime catalog, total 5,679,962 bytes. All six full locale catalogs total 6,696,540 bytes. These raw sizes describe source data, not compressed route transfer or marginal application cost.

## Audited source blobs

- `src/renderer/src/i18n/I18nProvider.tsx`: `4eab2d543ee818f957cc241baa9d0ecd43360632`
- `src/renderer/src/i18n/i18n.ts`: `725a40e9aaa26f350f4fea4ec0191ea7d6461080`
- `src/renderer/src/i18n/en-runtime-required.json`: `12e9f12c2b46a3fcbcc8300901638227bc68290d`
- `src/renderer/src/i18n/locales/en.json`: `f43ee68a388af0e7556b9f96c2d1f2ac80b7f39a`
- `src/renderer/src/i18n/locales/es.json`: `e151f2772cb7c964a5d3b45fe8470ee3a92ab238`
- `src/renderer/src/i18n/locales/fr.json`: `b21651912aa9f4d26d21a0f09d1c3b9b52ed2a4d`
- `src/renderer/src/i18n/locales/ja.json`: `9f4091e8057bd4f34625d57064e42739f7e36b61`
- `src/renderer/src/i18n/locales/ko.json`: `e03fdc58bdaac0530d458e39aa86b8f7aee5da66`
- `src/renderer/src/i18n/locales/zh.json`: `97dff1b1f1bcee436bc4e058081e4be2ff3fca6b`

There is not yet evidence that i18n is a meaningful part of a representative initial route, nor a matched production build. Treat this as a candidate inventory only.
