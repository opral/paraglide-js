# Native localization route survey

Captured 2026-10-12. Each SHA is the local checkout HEAD used for that capture; the original study-date pins were not available, so do not present these as the study revisions. Byte totals are encoded-size estimates from response bodies, not measured CDN transfer headers. All Brotli figures use quality 4. Memos uses Node's default `gzipSync` level; the other three use gzip level 9. Unless noted, no Paraglide migration was run for these routes.

| App and tested source SHA                                  | Toolchain used for route capture                                                           | Native loading and route                                                                                                                                                                                                                                                                                                                                   | Local route payload                                                                                                                                                                                                                              |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Memos `a668bb8f7e3652be029459bc80bd3bffb86f0542`           | Node 24.21.0, pnpm 11.0.1, Vite 8.0.11, React 19.2.6, i18next 26.3.6                       | `/auth`, French. A custom i18next backend dynamically imports the selected locale and keeps English fallback. Playwright stubs read-only Connect protobuf calls; no authenticated backend. There are 46 locale catalogs.                                                                                                                                   | 36 resource responses: **2,162,924 raw / 692,364 gzip / 684,981 Brotli-Q4 bytes**. `fr` and `en` message chunks total 31,996 Brotli bytes (4.67%); the separate i18n chunk is 18,223 Brotli bytes. No service-worker install graph was measured. |
| ntfy `8e7b5912e48123fff21e6b52d2d766f4e6743782`            | Node 24.21.0, npm `ci`, Vite 8.3.4, React 19.3.0, i18next 26.4.2, Playwright 1.64.0        | `/login`, French. i18next HTTP backend tries `fr-FR.json` (expected 404), then loads `fr.json` and English fallback. Normal-route capture blocks service workers.                                                                                                                                                                                          | 15 resources: **1,192,479 raw / 385,639 gzip / 382,941 Brotli-Q4 bytes**. The two successful runtime locale files total 74,789 raw / 17,554 gzip / 18,235 Brotli bytes (4.76% of route Brotli).                                                  |
| Clash Verge Rev `27efaf34f457f357bf73daa242df909fef1fa9ee` | Node 22.23.2, package lock declares pnpm 12.11.2; Vite 8.3.0, React 19.3.0, i18next 26.4.2 | Vite `/` Home UI with a small Tauri IPC mock. i18next loads the selected locale's ten startup namespace JSON modules in parallel and falls back to `zh`. Fourteen locales are listed.                                                                                                                                                                      | 31 resources: **1,780,340 raw / 555,251 gzip / 557,159 Brotli-Q4 bytes**. The ten English startup namespaces total 43,658 raw / 17,146 gzip / 17,353 Brotli bytes (3.1% of route Brotli). This is the Vite web route, not a full Tauri launch.   |
| Langflow `504c02fc47e76087b82b0e7cbe4186e9cdd916d4`        | Node 22.23.2, Vite 7.3.6, React 19.2.5, i18next 25.10.10                                   | `/`, French sign-in. English is statically imported; the selected non-English JSON is dynamically imported, and startup awaits `loadLanguage` before rendering. This frontend-only preview returns 500 for backend API calls, so the captured French page includes its translated unreachable-server dialog. No service-worker install graph was measured. | Clean local HTML and requested assets: **10,519,375 raw / 2,852,955 gzip / 2,805,881 Brotli-Q4 bytes**. French catalog chunk: 155,621 raw / 40,873 gzip / 40,717 Brotli bytes (1.45% of route Brotli). External Google fonts are excluded.       |

## Denominator and feature notes

ntfy has a separate first-install PWA denominator. Its checked-in Workbox config precaches `**/*.{js,css,html,ico,png,svg,json}`, including all 51 locale JSON files. The service-worker capture observed **74 distinct URLs**: 73 successful responses and one expected `/static/langs/fr-FR.json` 404. Summing successful distinct response bodies gives **2,931,157 raw / 862,603 gzip / 876,184 Brotli-Q4 bytes**; the 51 successful locale files account for **1,164,884 raw / 279,523 gzip / 292,952 Brotli-Q4 bytes (33.4%)**. A separate run recorded 85 request events across those 74 URLs because Workbox re-requested assets while precaching; Vite Preview used `Cache-Control: no-cache`. Treat 876,184 Brotli bytes as the unique-resource install inventory, not a guaranteed wire-transfer total. Keep this PWA install denominator separate from the 382,941-byte normal route denominator.

ntfy has 468 English keys across 51 catalogs, 10,250 sparse missing key-locale pairs that rely on fallback, 16 plural-suffix keys (including tested Polish plural behavior), and 14 markup keys across 12 `<Trans>` callsites. A static/interpolation-only conversion would change behavior. Langflow has 226 interpolation strings, 52 plural-suffix keys across 26 families, and two `<Trans>` callsites. The Memos isolated-catalog result excludes `setting.sso.scope-count_one` and `_other`; keep those plural forms visible as a feature gap rather than treating the synthetic catalog result as full parity.

The existing Memos files in `results/memos-baseline.json` are an **all-locales isolated-JS stress test**, not the `/auth` request graph. That separate run used Node 22.23.2, Vite 8.1.4, and i18next 26.3.6. At 46 locales and 911 included keys, it reports Paraglide at 2,874,195 raw / 1,018,312 gzip / 592,485 Brotli bytes and i18next at 2,516,840 raw / 756,921 gzip / 473,359 Brotli bytes. The baseline Paraglide output is larger in raw, gzip and Brotli in that denominator; the native comparator preserves source hierarchy and property order. Do not turn this into a production-route percentage.

Langflow also has a native preload control, not a Paraglide A/B. A temporary built-HTML script guarded by `?preload=1` read the saved language and modulepreloaded only the selected French chunk; the normal i18next loader then reused that request. Four alternating local runs with an artificial 100 ms delay on the French chunk gave median FCP **572 ms lazy vs 472 ms preloaded**. With no injected delay, both medians were **472 ms**. This shows that the selected-locale waterfall can be hidden by native preload under the synthetic delay; it does not attribute that gain to Paraglide or predict field FCP. No 40% whole-app win is asserted by this survey.

## Raw captures and reproduction

The captures and harnesses are in the ignored local scratch tree, so regenerate them before using this note on another machine:

- Memos: `.real-apps/memos-native/native-route-results.json`, harness `.real-apps/memos-audit/native-route.mjs`.
- ntfy: `.real-apps/ntfy-audit/native-route-results.json`, `native-pwa-firstload-results.json`, `native-pwa-firstload-all-results.json`, plus the commands and environment details in `.real-apps/ntfy-audit/README.md`.
- Clash Verge Rev: `.real-apps/clash-verge-audit/native-request-graph.json`, harness `.real-apps/clash-verge-audit/capture.mjs`.
- Langflow: `.real-apps/langflow-audit/native-fr-stock.json`, `latency-preload-ab-0.json`, `latency-preload-ab-100.json`, and `.real-apps/langflow-audit/capture.mjs` / `latency-marked.mjs`.

Memos route capture (Node 24.21.0):

```sh
cd /root/repos-iii/i18n-app-memos/web
corepack pnpm@11.0.1 install --frozen-lockfile
corepack pnpm@11.0.1 exec vite build --outDir /root/repos-iii/paraglide-real-apps/.real-apps/memos-native --emptyOutDir
corepack pnpm@11.0.1 exec vite preview --outDir /root/repos-iii/paraglide-real-apps/.real-apps/memos-native --host 127.0.0.1 --port 4177 --strictPort
# In another shell:
cd /root/repos-iii/paraglide-real-apps
node .real-apps/memos-audit/native-route.mjs
```

ntfy's full native route and PWA install setup commands are recorded in `.real-apps/ntfy-audit/README.md`; they use Node 24 via `npx -y -p node@24`, build the production web directory, and apply the repository's `app.html`/generated-config preview steps. With preview running, rerun each capture from the Paraglide checkout:

```sh
cd /root/repos-iii/paraglide-real-apps
node .real-apps/ntfy-audit/native-route.mjs
node .real-apps/ntfy-audit/native-pwa-firstload.mjs
node .real-apps/ntfy-audit/native-pwa-firstload-all.mjs
```

Keep the service-worker-enabled PWA capture and the service-worker-blocked route capture separate.

Clash Verge Rev route capture, from the audited source checkout (Node 22.23.2):

```sh
cd /root/repos-iii/paraglide-real-apps/.real-apps/clash-verge-source
corepack pnpm@12.11.2 install --frozen-lockfile
corepack pnpm@12.11.2 run web:build
corepack pnpm@12.11.2 run web:serve -- --host 127.0.0.1 --port 4180 --strictPort
# In another shell:
cd /root/repos-iii/paraglide-real-apps
node .real-apps/clash-verge-audit/capture.mjs
```

Langflow clean route capture (Node 22.23.2; source checkout at the SHA above):

```sh
cd /root/repos-iii/paraglide-real-apps/.real-apps/langflow-source/src/frontend
./node_modules/.bin/vite build --outDir /root/repos-iii/paraglide-real-apps/.real-apps/langflow-native-stock --emptyOutDir
./node_modules/.bin/vite preview --outDir /root/repos-iii/paraglide-real-apps/.real-apps/langflow-native-stock --host 127.0.0.1 --port 4181 --strictPort
# In another shell:
cd /root/repos-iii/paraglide-real-apps
LANGFLOW_LANG=fr node .real-apps/langflow-audit/capture.mjs
```

For the Langflow preload control, serve the preserved instrumented `.real-apps/langflow-native` output instead, then run `LOCALE_DELAY_MS=0 node .real-apps/langflow-audit/latency-marked.mjs` and `LOCALE_DELAY_MS=100 node .real-apps/langflow-audit/latency-marked.mjs`. This control edits only ignored scratch HTML and has no compiler changes.
