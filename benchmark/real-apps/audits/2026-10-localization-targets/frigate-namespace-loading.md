# Frigate i18next namespace-load inventory

## Snapshot and scope

- Repository: `blakeblackshear/frigate`, HEAD `ff9eb8f18430198548d9c9d2cf138ed9ac7b526b`, commit dated 2026-10-12 (`Keep frame shared memory mapped (#24644)`).
- Sparse checkout: `web/` and root `AGENTS.md`; no dependencies installed and no app build or browser measurements run.
- Runtime versions in `web/package-lock.json`: i18next 26.4.2, i18next-http-backend 4.0.2, react-i18next 17.0.16, Vite 8.3.3 (package range `^8.3.3`).

## Current loading behavior

`web/src/utils/i18n.ts` initializes i18next with an explicit 28-entry `ns` array, `defaultNS: "common"`, `fallbackLng: "en"`, and an HTTP backend at `locales/{{lng}}/{{ns}}.json`. The i18next configuration docs define `ns` as the namespaces to load and say `ns: []` disables namespace loading at initialization. With a French UI, the requested namespace set therefore includes all 28 configured namespaces for the selected language and English fallback; both French and English have all 28 corresponding files. This is currently eager namespace loading, not just “available namespaces”. The exact network request count was not browser-captured in this audit, so the counts below refer to catalog files available/requestable, not observed requests.

There are 368 `useTranslation` call sites. `web/src/App.tsx` lazy-loads route pages (`Live`, `Events`, `Explore`, `Exports`, `Settings`, `System`, and others), and those components request their own namespaces via `useTranslation([...])`. That gives a natural route-level load plan, but the global 28-namespace `ns` list prevents those per-route calls from being the limiting factor. `getTranslatedLabel()` directly calls i18next `t()` for runtime object/audio labels, so an optimized-native control must keep the `objects` and `audio` namespaces available for those data-driven calls; it must not count only static `useTranslation` hooks.

For a desktop `/` Live route, the conservative static namespace set from the visible shell and Live subtree is `common`, `views/live`, `components/dialog`, `views/system` (status bar), and `views/settings` (settings/command menus), plus `objects` and `audio` for the live data labels: 7 namespaces. A mobile Live route lacks the desktop status/settings chrome, leaving 5 likely namespaces (`common`, `views/live`, `components/dialog`, `objects`, `audio`). These are source-derived route sets, not browser-validated request traces. A fair native lazy control should load namespaces from active `useTranslation` hooks and keep `objects`/`audio` available for direct `t()` callers; compare Paraglide against that control, not the current eager list alone.

## Catalog coverage and bytes

The checked-in public translation tree has 58 locale directories, while `supportedLanguageKeys` in `web/src/lib/const.ts` lists 33 selectable UI language IDs. English and French each have all 28 configured namespace files. Sizes below sum each existing JSON file independently, then compress each file with Brotli quality 4 (same compression method for all alternatives; transfer headers are excluded).

| Catalog set | Files (fr + en) | Raw bytes | Brotli-Q4 bytes |
| --- | ---: | ---: | ---: |
| All configured namespaces | 56 | 565,625 | 160,687 |
| Desktop Live plausible set (7) | 14 | 283,709 | 83,080 |
| Mobile Live plausible set (5) | 10 | 87,972 | 30,513 |

The French route with the current eager config can transfer roughly 1.9x the Brotli catalog bytes of a desktop route-level set, or 5.3x a mobile set, before considering the non-trivial JS/runtime. This is evidence of a native namespace scheduling opportunity, not a Paraglide win. All counts are catalog-only and should be remeasured in the same Vite/browser harness before any performance claim.

## Decision

Frigate is a plausible follow-up only with an optimized-native namespace-scheduling baseline. The current config eagerly requests every listed namespace, despite route-specific hook usage and lazy page chunks. Do not use its current transfer as the native comparator. First establish the same-build native lazy control (including shared shell namespaces and data-driven object/audio labels); then compare the compiler output against that control and verify live language switching, dynamic labels, and route transitions.

Primary references: `web/src/utils/i18n.ts`, `web/src/App.tsx`, `web/src/pages/Live.tsx`, `web/src/views/live/LiveCameraView.tsx`, `web/src/components/Statusbar.tsx`, `web/src/components/menu/CommandMenu.tsx`, `web/src/utils/i18n.ts`, `web/src/context/language-provider.tsx`, `web/src/lib/const.ts`, `web/public/locales/{en,fr}`. i18next's official [configuration options](https://www.i18next.com/overview/configuration-options) and [namespaces guide](https://www.i18next.com/principles/namespaces) describe `ns` as the set to load and show namespaces can be loaded later.
