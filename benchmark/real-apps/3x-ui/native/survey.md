# 3x-ui selected-locale route survey

Source pin: `MHSanaei/3x-ui@74c3cc38821cabd66ad316ea562851422d0b0063` (shallow sparse checkout; 13 MB). App: `frontend/` (React 19 / Ant Design 6 / Vite 8.3.4), production output `internal/web/dist/`.

## Native i18next path

`frontend/src/i18n/react.ts` statically imports only `en-US.json`; `import.meta.glob` creates a lazy loader for the other 12 translation JSON files. `readyI18n()` reads `lang` from the panel cookie (or maps browser language), initializes `en-US` as fallback, imports only the selected locale, awaits the import, then calls `changeLanguage`. `frontend/src/entries/login.tsx` awaits `readyI18n()` before creating the React root. Thus a non-English locale module is on the login screen's first-render path. `frontend/login.html` is the login-only entry. There is no French catalog; Spanish `es-ES` is the tested locale.

All 13 catalogs have 2,589 scalar leaves, with exactly equal key sets and zero empty-string values. The Spanish catalog has zero missing/extra keys relative to the English fallback; fallback is configured but not exercised by catalog gaps on this route.

## Build and route smoke

Repro inputs: `package-lock.json` SHA-256 `4102c5530996fa24f8152bdeaee99f73a8bd4c85d86e562a707a2a1e7bef43a7`; Vite config `6c751369671e23e640a106f7f9ab6299da2890787c7562c07238571f71e24097`; i18n setup `240237e3bca365098528fab81c4d7c89ba5afc0a8a2df4d0a0d1290232ace322`; login entry `2543e0a88e2b332e21574deb8ca001af96b3c27f6513fb6a849412290b2aa3df`.

The original production command `npm run build` succeeded at the pin using Node 26.3.1/npm 11.8.0 and Vite 8.3.4. It ran the checked-in OpenAPI generator (184 paths, 195 operations), transformed 5,750 modules, and built the three original HTML entries. Vite config's optional database read falls back to `/` when no local panel database is present, so no DB was required to build.

A second identical Vite build with `--manifest` was used only to inspect entry dependencies. The browser smoke served the resulting production files through a local static server at `/login`; three read-only fixtures returned a dummy CSRF token, disabled two-factor auth, and no sponsors. It did not submit a login or contact an external API. With `lang=es-ES`, the page rendered `Hola`, `Nombre de Usuario`, `Contraseña`, and `Acceder`, requested exactly one locale asset (`es-ES-CbS94hW4.js`), returned 200 for every requested asset/API fixture, and produced no page or console errors. The smoke output and server/probe scripts are in this directory.

## Route graph bytes

The login HTML plus its static-import closure, CSS, and one selected Spanish locale asset is 2,525,484 raw bytes. Summing each asset independently after Brotli quality 4 gives 758,343 bytes (763,489 gzip level 9). This is a reproducible asset-sum estimate, excluding transfer headers. The login route requests the English catalog in the shared `QueryProvider` chunk (160,032 raw / 54,115 Brotli Q4), the Spanish chunk (155,319 raw / 50,204 Brotli Q4), and the separate i18next vendor chunk (48,282 raw / 16,346 Brotli Q4). The English resource chunk also carries shared runtime code, so those compressed numbers are asset totals, not an exact marginal localization attribution. The other 11 non-English locale chunks are emitted but not requested on this route.

Pinned output hashes:

- `.vite/manifest.json`: `d022661433fb20a19b5b668ef48016af61a5678a9c899283649647ec19bdcc65`
- `login.html`: `7ee082e07fe7b3accb8ed677deda30a9c5d9eb16aa10c1d7233817e0a14ee3ca`
- login entry JS: `7631f5d47e61bba811b65a993f6aa66d0fca9bff5e1dc115ef5b70fa319ec61f`
- shared locale/query chunk: `d32a39a7e5d12bb46dcf2604116fd4df89ff1d448faed64ee97f222bf7651d1b`
- Spanish locale JS: `bd8445cb34d18b4aa0e56ece3b5ce9c4f4c3d0c8fb23ec2de575b9ce9927944f`

This is the strongest of the four source-only candidates for a follow-up compiler comparison: it has a real selected-locale await before first render, locale chunks are already split, and there is a self-contained Vite build/login HTML entry. The login graph is not especially small (about 758 KB Brotli Q4), so performance qualification still requires an actual Paraglide comparison. No performance win is inferred from the source or graph alone.
