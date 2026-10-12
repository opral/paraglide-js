# Trilium pre-auth localization route inventory

Status: no compiler candidate. The native app already isolates the pre-auth route to its small `entry` namespace, with the identified localization chunk and catalogs accounting for 6.64% of estimated French-route Brotli bytes. No candidate build or page-load comparison was run.

## Reproducible source/build snapshot

- Source: `TriliumNext/Trilium`, commit `0340a668c3c277303808ab6cb2445538b83710fd` (`ci: keep web clipper releases out of the Trilium release workflows`), checked out 2026-10-12.
- Sparse working copy: `.real-apps/trilium-source` under `/root/repos-iii/paraglide-client-route-split-proto`.
- Install: `pnpm install --filter @triliumnext/client... --filter @triliumnext/share-theme... --frozen-lockfile --ignore-scripts --prefer-offline` (pnpm 12.10.1).
- Native production build: `pnpm --filter @triliumnext/client build`. This invokes `cross-env NODE_OPTIONS=--max-old-space-size=4096 vite build`; Vite 8.3.4 transformed 6,422 modules and completed in 3.06 seconds. Output: `apps/client/dist` (64 MB, 1,604 files). No app source was changed.

## Native locale behavior

`apps/client/src/services/i18n.ts` defines `entry` and `translation` as separate namespaces. `initLocale(..., "entry")` initializes only `entry`; the normal application initializes both `translation` and `entry`, with `entry` as the fallback namespace. Locale files are loaded over HTTP from `translations/{{lng}}/{{ns}}.json`, with English fallback (`services/i18n.ts:14-50`).

The login and password setup entrypoints call `initLocale(currentLocale ?? "en", "entry")` (`src/login.tsx:13-15`, and similarly `src/set_password.tsx`). `src/index.ts` dynamically loads the login/set-password branch when the bootstrap state says the user is not authenticated. On successful login the browser navigates back to the main app, so the pre-auth route is a real, bounded locale-only graph. The setup wizard also uses `entry`, but offers in-page locale switching; it is separate from the login route measurement.

The client ships 41 `entry.json` files totaling 217,006 raw bytes: 20 contain translations and 21 are empty. English is 12,253 bytes / 157 leaf strings; French is 4,601 bytes / 53 leaf strings. The French route therefore relies on English fallback for many entry labels. The broader `translation.json` namespace has 41 files totaling 5,333,963 raw bytes (English 257,701; French 169,292), but the pre-auth login graph does not request it.

The product has 28 locale IDs in `@triliumnext/commons` (`LOCALES`), while 41 translation directories exist. A migration must preserve the exposed locale list and not assume every shipped catalog is selectable.

## French login route byte accounting

I built the native client and statically accounted the French pre-auth resource graph from the built HTML, its static script/style references, the index module's static imports, the login dynamic-import map, the three default server stylesheets, and French plus English `entry.json` files. After deduplicating URLs, that graph is 72 resources and approximately 342,037 Brotli-Q4 bytes (1,169,014 raw bytes). It is an offline graph accounting, not a browser network capture; it excludes bootstrap response/header bytes and optional icon/theme assets.

| Resource group | Raw bytes | Brotli-Q4 bytes |
| --- | ---: | ---: |
| HTML | 6,612 | 2,380 |
| Initial application JS/CSS dependencies | 339,344 | 72,969 |
| Login-branch-only dependencies after overlap | 723,059 | 240,697 |
| Default server stylesheets | 83,145 | 20,624 |
| French + English `entry.json` | 16,854 | 5,367 |
| **Total** | **1,169,014** | **342,037** |

The i18next-related browser runtime chunk is 51,352 raw / 17,334 Brotli bytes. Those existing resources sum to 22,701 bytes, or 6.64% of the accounted route transfer. This is a prioritization estimate, not a universal bound on a rebuilt app: changing module grouping can change compressed bytes elsewhere, and page readiness requires a browser comparison. The existing namespace split also means the app’s large `translation` catalogs and their request are already absent from the login route.

## Decision

Deprioritize Trilium’s login route for the next byte experiment. Its identified localization resources account for less than the requested 10% threshold, and no compiler candidate has demonstrated a qualifying gain. A page-load improvement remains untested. The large login branch is mostly unrelated UI and shared dependencies; changing those is outside this compiler campaign. This inventory does not evaluate the authenticated app route.
