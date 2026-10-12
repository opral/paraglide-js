# 3x-ui native route baseline

This archive pins the stock i18next production build and Spanish login-route smoke for `MHSanaei/3x-ui` at `74c3cc38821cabd66ad316ea562851422d0b0063`. The app is `frontend/`; its checked-in Vite version is 8.3.4. The native build keeps all three original HTML entries and the checked-in `manualChunks` configuration.

The source checkout is intentionally kept separate from this benchmark repository. The archived `native-dist.tar.gz` is the exact 8.2 MB `internal/web/dist` output used for the smoke. `native-output-sha256.txt`, the Vite manifest-derived route graph, and the Playwright trace identify the measured files and requests. `native/survey.md` records source hashes, tool versions, and the build procedure.

The frozen upstream application artifact retains its [upstream license](native/UPSTREAM-LICENSE); the corresponding source is the pinned [3x-ui checkout](https://github.com/MHSanaei/3x-ui/tree/74c3cc38821cabd66ad316ea562851422d0b0063).

The native loader statically imports `en-US`, lazily imports the selected catalog, and awaits that import before mounting the login entry. The Spanish smoke uses `lang=es-ES` and read-only fixtures for CSRF, two-factor status, and sponsors. It never submits credentials or contacts a real backend. The page displayed `Hola`, `Nombre de Usuario`, `Contraseña`, and `Acceder`; it fetched one locale asset and reported no page or console errors.

## Reproduce

Use Node 26.3.1 and npm 11.8.0, then check out the pinned app source in a separate directory:

```sh
git clone --filter=blob:none https://github.com/MHSanaei/3x-ui.git 3x-ui
git -C 3x-ui checkout 74c3cc38821cabd66ad316ea562851422d0b0063
cd 3x-ui/frontend
npm ci
npm run build
# A second build adds the dependency manifest used by graph.mjs:
npm exec vite build -- --manifest
```

The build invokes the checked-in OpenAPI generator and writes `internal/web/dist`. To reproduce the route smoke, place `serve.cjs` and `probe.mjs` from this archive in `frontend/.real-apps/3x-ui-route/`, install the Playwright browser in the app environment if needed, and run:

```sh
cd .. # return from frontend/ to the app repository root
node frontend/.real-apps/3x-ui-route/serve.cjs
```

In another shell, run the probe with the app's frontend directory as the working directory:

```sh
cd 3x-ui/frontend
node .real-apps/3x-ui-route/probe.mjs
```

The probe writes `route-smoke.json` beside itself. The server's only API fixtures return a dummy CSRF token, disabled two-factor auth, and an empty sponsor list.

## Scope

The login route's static-import closure, styles, and selected Spanish locale total 2,525,484 raw bytes, 763,489 gzip level 9, and 758,343 independently compressed Brotli-Q4 bytes. Those are asset-sum estimates, not browser transfer totals or exact marginal localization costs. This baseline is already lazy by locale and is not evidence of a Paraglide win. Any follow-up must compare the same login HTML entry, all 13 locale catalogs, the same Vite chunking, and the same visible controls.
