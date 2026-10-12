# Additional native i18next route survey

Captured 2026-10-12 from pinned production builds in `.real-apps/`. The checked-out Paraglide survey worktree is at `ec591218bb814c65e0a9f6a0252f8ec75236aa17`; no compiler or app source files were changed. The browser harness and detailed request traces are in `native-route-additions.mjs` and `results/native-route-additions.json`.

The route pass runs three fresh Chromium contexts per web target with browser cache and service workers disabled, an 80 ms RTT, 20 Mbps down / 2 Mbps up and 3x CPU emulation. The local static server Brotli-compresses text at quality 4 and leaves images, fonts and other binary resources uncompressed. Third-party and backend API traffic is blocked or returned as local 404. FCP and LCP are synthetic local route timings, not field Web Vitals. Route body totals include the navigation document and same-origin resources but exclude HTTP headers. Source catalog compression is computed per locale file independently and is an inventory, not a measured built-bundle delta.

| App (pinned SHA) | Native loading path | Locale files; Brotli-Q4 source total | Frontend route result |
| --- | --- | ---: | --- |
| World Monitor (`968eac6bb03abec85b02f0e014a2c7835f28ee1d`) | English shell plus dynamic locale module. French route fetches `locale-fr` and full English fallback. | 28; 5,812,550 raw / 1,714,403 Brotli bytes | `/dashboard.html?lang=fr`, French title/shell; median FCP/LCP **128 ms**, **1,334,081 encoded body bytes**, 148 local resources. French+English modules are 107,793 bytes (8.1% of route body). Live-data APIs are blocked. |
| Open WebUI (`f8ae8a6c328946dc62cd0712961a0632574581bf`) | SvelteKit `resourcesToBackend` dynamically imports the selected locale's `translation.json`; English fallback, query-string detector. | 64; 18,344,334 raw / 4,377,176 Brotli bytes | Static `/` fallback: FCP/LCP **1,156 ms**, 1,664,472 body bytes, 181 resources, but it stays on a splash/loading shell without the Python API. No locale chunk was requested. Not a meaningful translated-page baseline. |
| Chatbox (`0ac6385ae1ff5bf778777826da3c5edcd55b61b8`) | All locale JSON statically imported into `i18nextResources`; settings set the locale from `WebPlatform.getLocale()` on first use. | 15; 2,130,887 raw / 617,386 Brotli bytes | Production web renderer `/`, Playwright locale `fr-FR`; French UI verified. Median FCP/LCP **248 ms**, **3,216 ms**, 4,049,599 body bytes and 19 local resources. No locale-file requests; main `/js/index.D3q1VHZr.js` is 3,200,966 Brotli bytes. Separate-file locale compression is a 15.2% route / 19.3% main-chunk upper-bound, not an A/B result. |
| Paperclip (`1b4c803816e82b0265c8422e1a804327a7ed8c54`) | Eager Vite glob of every locale JSON into `i18nextResources`; synchronous English startup. | 40; 8,631 raw / 5,865 Brotli bytes | `/` median FCP **2,000 ms**, no LCP entry, 3,003,177 body bytes and 52 resources. UI stays at “Loading…” without its API service. The eager catalog itself is too small to explain route size. |
| Stirling-PDF (`313794c573df5e92d2f020f5ec53d08b264d6e4f`) | Browser language detector and custom HTTP/TOML backend. For French, requests selected `fr-FR` plus English fallback. | 42; 27,573,987 raw / 7,371,886 Brotli bytes | `/`, French file-library UI verified. Median FCP/LCP **784 ms**, **2,000 ms**, 1,108,850 body bytes and 60 resources. English TOML is 155,081 bytes and French TOML 172,875 bytes: **327,956 bytes / 29.6%** of this route body. This already-lazy native strategy is a useful comparison for any compiled output. |
| LosslessCut (`70f2663a7a7c995903701acd2f616d057f4fdc2f`) | Electron main-process locale detector and filesystem backend; catalogs are not browser-served. | 36; 2,614,752 raw / 792,359 Brotli bytes | Electron production renderer build passed. No browser route was measured because this checkout did not contain the Electron runtime binary, and serving `out/renderer` alone cannot supply `window.require`, main-process locale or filesystem backend behavior. |

Resolved toolchains were: World Monitor React 19.2.4 / Vite 6.4.3 / i18next 25.10.9; Open WebUI Svelte 5.56.0 / SvelteKit 2.68.0 / Vite 5.4.21 / i18next 23.16.8; Chatbox React 18.3.1 / Vite 7.3.6 / i18next 22.5.1; Paperclip React 19.2.8 / Vite 8.2.2 / i18next 26.4.2; Stirling-PDF React 19.3.0 / Vite 7.3.6 / i18next 26.3.6; LosslessCut React 19.2.6 / Electron-Vite 5.0.0 / i18next 26.3.0. Each inspected UI route uses the default `translation` resource namespace; the observed strategy differences are locale loading (eager bundle, dynamic chunk, HTTP backend, or filesystem) rather than per-feature namespaces.

The eager shipping candidate is Chatbox: its 15 source locale files total 617 KB Brotli-Q4, it has a French production route, and the route request graph contains no separate locale resources. Its largest initial JavaScript module is 3.20 MB Brotli. A compiler A/B must measure the actual generated bundle and LCP; the separate-file catalog ratio only indicates available headroom. Stirling-PDF is the clearest lazy-backend control: it already fetches exactly the chosen language and English fallback, whose bytes are about 30% of the initial route. World Monitor's selected locale plus English fallback are about 8% of route bytes. Paperclip has eager imports but only 5.9 KB of total separately compressed catalog data.

Open WebUI and Paperclip builds passed, but their product route needs its backend to leave the shell. The route harness deliberately does not fabricate a backend payload; their byte and FCP numbers are static frontend request-graph observations, not fully loaded product-page UX. LosslessCut is build/catalog-only in this pass. These exclusions do not affect the three verified translated UI routes (World Monitor, Chatbox and Stirling-PDF).

## Pinned build commands

The checkouts are shallow clones at the SHAs in the table. Node was 22.23.2 unless the repository requires Node 24.21.0 (Paperclip). Commands below are run from each source checkout.

```sh
# World Monitor — pre-existing checkout in the sibling survey workspace
cd /root/repos-iii/paraglide-real-apps/.real-apps/worldmonitor-source
VITE_VARIANT=full ./node_modules/.bin/vite build \
  --outDir /root/repos-iii/paraglide-native-route-survey/.real-apps/worldmonitor-dist \
  --emptyOutDir

# Chatbox
cd /root/repos-iii/paraglide-native-route-survey/.real-apps/chatbox-source
corepack pnpm@10.33.0 install --frozen-lockfile
CHATBOX_BUILD_PLATFORM=web corepack pnpm@10.33.0 run build:renderer

# Open WebUI (the default 4 GB Node heap OOMs while rendering chunks)
cd /root/repos-iii/paraglide-native-route-survey/.real-apps/open-webui-source
npm ci
NODE_OPTIONS=--max-old-space-size=8192 npm run build

# Paperclip UI (run the project-required Node 24.21.0 wrapper)
cd /root/repos-iii/paraglide-native-route-survey/.real-apps/paperclip-source
npx -y -p node@24.21.0 -c 'corepack pnpm@9.15.4 install --frozen-lockfile'
npx -y -p node@24.21.0 -c 'corepack pnpm@9.15.4 --filter @paperclipai/ui build'

# Stirling-PDF
cd /root/repos-iii/paraglide-native-route-survey/.real-apps/stirling-pdf-source
npm ci --prefix frontend
cd frontend
UV_THREADPOOL_SIZE=16 ./node_modules/.bin/vite build editor --mode production

# LosslessCut
cd /root/repos-iii/paraglide-native-route-survey/.real-apps/lossless-cut-source
corepack yarn install --immutable
corepack yarn build
```

Chatbox's enclosing `build:web` script also built the renderer, then failed in post-build source-map cleanup because `.erb/scripts/delete-source-maps-runner.js` is missing from this checkout. `build:renderer` is the successful, reproducible production web-target build used for capture. Open WebUI's first build attempt with the default heap exited with V8 out-of-memory after transforming the client; raising the heap to 8 GB completed the same pinned production build. Stirling-PDF's Dockerfile uses `vite build editor`; invoking Vite with the config file directly from the wrong directory failed, so the successful command follows the repository Dockerfile's build target. The Electron binary was not installed in LosslessCut's checkout, so no renderer-only browser number is reported.

## Route capture

From the survey worktree, after the above builds and with the sibling Paraglide workspace's pinned Playwright install available:

```sh
node benchmark/real-apps/native-route-additions.mjs
```

`NATIVE_ROUTE_TRIALS` can override the default of three cold runs. The script records per-route resources and localization requests, source catalog sizes, visible text, browser errors and medians in `results/native-route-additions.json`.
