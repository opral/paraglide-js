# DrawDB: public Vite locale-split experiment

This experiment does not qualify as a >10% production win. It tests the public Paraglide Vite plugin on a pinned DrawDB checkout with an app-specific i18next compatibility layer. Locale splitting reduces requested transfer by 7.5% on `/` and 8.8% on `/editor` against native i18next, but LCP improves by only 4.4% and 1.9%, respectively. Switching to German is slower with the split build.

## Reproduction and scope

- App: DrawDB `351bd6050692d5b7d7fb50cc283ef90a19d817ea`, Vite 8.1.0, Node 22.23.2, i18next 23.16.8.
- Compiler: Paraglide source `486153d0e95359606a63f6833e5a1e6132555dff` (PR4 build).
- Catalogs: 51 locales and 364 flattened string keys. The migration codemod maps literal `t("key")` calls to generated message functions and maps a finite set of known dynamic keys to generated functions. It retains the app's locale aliases and metadata.
- The compatibility bridge implements the subset of `react-i18next` used by this checkout, including language detection, language change, a language-bound `t` identity, and a `useSyncExternalStore` subscription. This is not a general i18next adapter: arbitrary dynamic keys, namespaces, fallback chains, rich `<Trans>` usage, and the broader i18next option surface are not established here.
- Browser route results were captured on the initial adapter build; a subsequent rebuild with the corrected language-bound `t` identity changed the main chunk by 33 bytes. The German switch run below uses that corrected rebuild. Treat the cold-route results as a bounded experiment rather than a benchmark of a supported migration path.

Run from this worktree:

```sh
node benchmark/real-apps/drawdb-public-vite-split.mjs
DRAWDB_OUTPUT=.real-apps/drawdb-public-split \
DRAWDB_BROWSER_REPORT=.real-apps/drawdb-public-split/browser-results.json \
DRAWDB_VARIANTS=public-default,public-locale-modules,public-split \
node benchmark/real-apps/drawdb-public-browser.mjs
node benchmark/real-apps/drawdb-public-language-switch.mjs
```

The browser route harness uses three cold passes over `en`, `de`, and `pa-PK` on both `/` and `/editor`, with 80 ms network latency, 20 Mbps down, 2 Mbps up, and 3× CPU throttling. It compares exact visible `#root` text with the native app. Each route/variant has nine observations. The locale-switch harness runs three trials per variant on `/editor`, passes the database-choice modal, then switches from English to German through DrawDB's Settings UI.

## Cold route results

Medians across the nine observations per route and variant:

| Variant | Route | Transfer | FCP | LCP | Long tasks |
| --- | --- | ---: | ---: | ---: | ---: |
| Native i18next | `/` | 3,353,096 B | 2,452 ms | 3,272 ms | 959 ms |
| Public default output | `/` | 3,303,459 B | 2,404 ms | 3,220 ms | 906 ms |
| Public explicit locale modules | `/` | 3,361,955 B | 2,444 ms | 3,248 ms | 975 ms |
| Public locale split | `/` | 3,102,941 B | 2,300 ms | 3,128 ms | 857 ms |
| Native i18next | `/editor` | 2,857,160 B | 2,496 ms | 2,752 ms | 1,051 ms |
| Public default output | `/editor` | 2,807,523 B | 2,452 ms | 2,716 ms | 1,030 ms |
| Public explicit locale modules | `/editor` | 2,866,019 B | 2,568 ms | 2,824 ms | 1,113 ms |
| Public locale split | `/editor` | 2,607,005 B | 2,452 ms | 2,700 ms | 973 ms |

The locale-split build requests 7.5% fewer bytes on `/` and 8.8% fewer bytes on `/editor` than native i18next. Its LCP reductions are 4.4% and 1.9%. Against Paraglide's default output, the split mode saves 6.1% and 7.1% of route transfer, so the result is not just an eager-versus-lazy comparison. The explicit `locale-modules` mode is slightly larger and slower than native on both routes.

All route observations had exact visible-text parity and no page errors. The route report is in `.real-apps/drawdb-public-split/browser-results.json`; build outputs and hashes are in `.real-apps/drawdb-public-split/build-results.json`.

## Locale switching

| Variant | Median English→German switch | Exact visible text parity | Page errors |
| --- | ---: | ---: | ---: |
| Native i18next | 82 ms | 3/3 | 0 |
| Public default output | 82 ms | 3/3 | 0 |
| Public locale split | 263 ms | 3/3 | 0 |

The split implementation loads the selected locale asynchronously before updating the synchronous message facade. It preserves the UI but adds about 181 ms over native/default for this interaction. Detailed observations are in `.real-apps/drawdb-public-split/switch-results.json`.
