# LocalAI i18next source and login-route audit

This is a read-only source audit for the pinned LocalAI frontend, not a migration or a performance result. No LocalAI source files were changed and no app build or browser run was performed for this audit.

## Pin and reproduction

- Repository: `mudler/LocalAI`
- Source commit: `a551c83465ee538367358f239de5a364ebea9329`
- Frontend: `core/http/react-ui`
- Lockfile versions: Vite `8.0.16`, i18next `26.0.8`, react-i18next `17.0.6`, i18next-http-backend `3.0.6`, i18next-browser-languagedetector `8.2.1`, React/React DOM `19.2.8`.
- App source is pinned by Git commit; source/config and locale JSON SHA-256 values are recorded in [evidence.json](./evidence.json).

Rebuild the machine-readable inventory with Python 3:

```sh
python3 inventory.py /path/to/LocalAI --out evidence.json
```

The script reads `core/http/react-ui/src`, `public/locales`, the frontend package lock, and `core/http/app.go`. It does not install dependencies or write to the pinned checkout. Leaf counts count every JSON string, number, boolean, or null recursively; containers are counted separately. Byte counts are source JSON UTF-8 bytes, uncompressed. Dynamic-key and hook scans are lexical source inventories, not semantic reachability proofs.

## Catalog shape and namespace inventory

The app contains 115 locale JSON files across eight supported locales and 22 distinct filename namespaces. The exported `NAMESPACES` list also contains 22 strings, but the lists do not match: it declares `studio` and `usage`, for which there are no namespace JSON files, while the files contain `importModel` and `modelEditor`, which the constant omits. A compiler/migration inventory should use the actual files and source imports together rather than treating the constant as a complete file manifest.

| Locale | Files | Raw JSON bytes | Primitive leaves |
| --- | ---: | ---: | ---: |
| en | 22 | 269,389 | 5,368 |
| de | 13 | 61,478 | 1,306 |
| es | 13 | 60,457 | 1,306 |
| id | 14 | 63,539 | 1,399 |
| it | 13 | 60,021 | 1,306 |
| ko | 13 | 63,119 | 1,315 |
| pt-BR | 14 | 76,819 | 1,575 |
| zh-CN | 13 | 56,306 | 1,306 |
| **Total** | **115** | **711,128** | — |

The counts are an inventory only, not transfer sizes or a claim that every file is eagerly requested. The native backend fetches resources from `/locales/{{lng}}/{{ns}}.json` through `apiUrl()`, and the Go handler sets `Cache-Control: public, max-age=300`.

## What the native login route uses

`src/i18n/index.js` initializes i18next with `common`, `nav`, and `errors`, uses English fallback, and enables React Suspense. Language detection is localStorage key `localai-language`, then navigator, then the HTML `lang` attribute. `languageChanged` updates the document’s `lang` attribute.

The router defines `/login` and `/invite/:code` as direct lazy `Login` routes, outside the authenticated `/app` route. `Login.jsx` calls `useTranslation('auth')`; its visible strings and login/register error labels come from that namespace. The `auth` catalog exists for all eight locales. Thus the native login path starts with the three configured namespaces and then requests `auth` when the lazy Login component is rendered. English fallback still applies if a selected locale lacks a key.

The root `Suspense` fallback is `BootFallback`, which renders `LoadingSpinner`. The spinner’s status label is the hard-coded string `Loading`; neither component calls i18next. The always-mounted `ThemeProvider`, `BrandingProvider`, `AuthProvider`, and `OperationsProvider` do not call translation hooks. Branding and authentication do make their existing API requests. In auth-enabled unauthenticated state, `OperationsProvider` does not start admin polling; in no-auth mode its existing `isAdmin` calculation can start polling briefly before Login redirects to `/app`, so preserve that behavior in any app-level comparison. `App`, its `nav` hook, `Sidebar`, `ToastContainer`/`ToastItem` (`common`), and their translation hooks are not rendered on `/login`.

A fair native startup control for a later route comparison can preserve all resources, detector behavior, initialization, fallback, providers, and errors, while optionally calling `i18n.loadNamespaces('auth')` early only on `/login` and `/invite/:code`. That makes the login namespace request overlap the existing initial namespace and lazy-page work; it is a control for route-aware scheduling, not key pruning. It must not remove the current Suspense fallback or swallow i18next/backend errors. Before comparing, verify the exact request sequence and fallback-language requests from the actual HTTP server.

## Dynamic keys, interpolation, and `returnObjects`

The source scan finds 211 template-literal `t(...)` key expressions in production JS/JSX source and five `returnObjects: true` call sites. Examples of genuinely runtime-derived keys include:

- `Workbench.jsx`: `${kind}.why`, `${kind}.stored`, and many `${kind}.*` lookups; `kind` selects the `voice` or `face` catalog subtree.
- `StudioComposer.jsx` and `Workspace.jsx`: `studio.starters.${type}` under the `media` namespace.
- Other route code forms keys from runtime states and metadata, for example `templates.${tpl.id}.label`, `state.${state}`, and `jobs.status.${s}`.

The five `returnObjects` sites return structured values: chat suggestions are arrays of strings; the `voice`/`face` `why` values are arrays of strings; `stored` values are arrays of `{where, what}` objects; and media `studio.starters` values are arrays of `{label, text}` objects. Several of these paths are only present in English locale files and are resolved through i18next’s English fallback in other languages. See the per-locale raw and fallback-resolved tree records in `evidence.json`.

Do not flatten the locale trees into a union and reconstruct arrays/objects from a base-locale shape. For `returnObjects`, preserve the exact selected-locale value shape and i18next fallback behavior; dynamic `kind`, `type`, metadata-derived keys, plural selection, and interpolation values must remain supported. The locale files have 206 English `_one`/`_other` suffixed entries and 33–35 in each non-English catalog; code also uses `count` broadly. The dictionary suffix count alone is not a complete plural-call inventory.

## Readiness before a migration experiment

The login route is the cleanest next LocalAI path because it has one lazy page namespace (`auth`) plus the three native startup namespaces, without pulling the authenticated app shell. A candidate should first demonstrate a full-project generation path and then compare against the route-aware native control above. It must retain all 115 source catalogs or an equivalent complete compiled representation, all eight locale choices and English fallback, auth/API failure behavior, and the app’s `returnObjects` shapes. This audit does not establish that the full project compiles under the current SDK/Lix budget and makes no speed or byte claim.
