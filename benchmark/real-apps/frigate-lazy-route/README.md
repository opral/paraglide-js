# Frigate Live route localization probe

This is a pinned, one-route diagnostic comparing an optimized native i18next control with a Paraglide candidate. It does not qualify a performance improvement and does not represent a full migration: the candidate adapter compiles nine selected namespaces but leaves i18next's HTTP backend in place for other namespaces.

## Inputs

- Frigate: `blakeblackshear/frigate` commit `ff9eb8f18430198548d9c9d2cf138ed9ac7b526b`.
- Toolchain in that source: Vite `8.3.3`, i18next `26.4.2`; build target ES2022.
- Compiler source: `/root/repos-iii/paraglide-client-split-current-api` commit `6997d020813d76f087d585110e62cd54891726e0`.
- Compiler `dist/index.js` SHA-256: `72884458211415a046050e655997ed49caaf56b7697012790dab084d32a62bc1`.
- Compiler client-locale-split plugin SHA-256: `c06f8dd894f68f6040deeb8ff62d449d4b133fb12bb78520dd5e7f9a5c49dd70`.

The source has 28 configured namespaces, not 29. The candidate uses all 33 supported locales and nine Live-route namespaces: `common`, `objects`, `audio`, `components/camera`, `components/dialog`, `components/player`, `views/live`, `views/settings`, and `views/system`. `objects` and `audio` stay present because Frigate resolves those labels from runtime camera metadata.

## Reproduction

Use a clean checkout at the pinned Frigate revision, install its locked dependencies and Playwright browser, then point these variables at the source checkout and pinned compiler dist. The generator reads checked-in Frigate catalogs and creates the temporary Paraglide project. The runner verifies the source revision, builds both variants, checks that the compiler emitted the complete expected locale/message inventory, and captures the desktop French route.

```sh
export FRIGATE_WEB_ROOT=/path/to/frigate/web
export PARAGLIDE_PLUGIN_ENTRY=/path/to/paraglide-client-split-current-api/dist/index.js
bash benchmark/real-apps/frigate-lazy-route/run-probe.sh
```

Run the script from this benchmark checkout. It writes raw traces under `results/`; generated Frigate build files are under `web/dist` and `web/src/paraglide` and should not be committed. The test opens `/#front_door`, sets French before navigation, captures the first naturally visible `Retour` and `Historique` controls, records font/locale/request timings, and fails on browser errors. It does not use a fixed delay or user interaction to manufacture readiness.

The check is intentionally fail-fast: the source must have 33 locales, 3,040 raw `(namespace,path)` pairs and 3,039 i18next `keySeparator`-normalized IDs. The route map and generated client metadata must match that full union. A zero-message or partial compiler output is invalid.

## Archived evidence

`results/native-es2022-route.desktop.json`, `results/paraglide-tla-route.desktop.json`, and `results/paraglide-async-init-route.desktop.json` are the original raw browser traces. The report in [`route-report.md`](route-report.md) records the negative result and limits. Build output snapshots are deliberately omitted; the source revision and build scripts reproduce them.

The native trace used HTTP/1.1. Native French controls appeared at 497.8 ms, with Inter Medium complete at 497.3 ms; all selected en/fr locale JSON had completed by 257.1 ms. The async-init Paraglide trace showed locale modules complete by roughly 56 ms, controls at 504.3 ms, but still had 80 HTML modulepreloads and 112 JS resources versus native's 14 preloads and 42 JS resources. Its offline Brotli-Q4 route estimate was 1,511,393 bytes versus 1,399,964 bytes native (+8.0%). These are one-run diagnostics, not paired performance claims.
