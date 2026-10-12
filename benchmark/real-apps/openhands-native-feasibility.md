# OpenHands native French startup baseline

This is a single cold browser trace of the existing native i18next application. It records where locale resources enter the client critical path before deciding whether a Paraglide compiler experiment is justified. It is a feasibility observation, not a performance distribution or a claim that compiler optimization can exceed a particular threshold. This mock-mode build ships the MSW client worker; its bytes and startup work do not qualify as a production migration comparator. The later [production-mode trace](openhands-production-native-feasibility.md) records the production artifact with external API fixtures.

## Reproduction and pins

The trace script is [openhands-native-cold-trace.mjs](openhands-native-cold-trace.mjs); the complete raw request and response log is [openhands-native-cold-fr.json](results/openhands-native-cold-fr.json). It reads an existing `build/` and does not rebuild or modify the app.

The source is `/root/repos-iii/openhands-locale-audit`, clean at `02e02ae0c92ebb033afcf2fb399bd3683df82ca8` (`@openhands/agent-canvas` 1.27.0). The native mock build command is `npm run build:mock` (`VITE_MOCK_API=true`), under Node 24; the package requires Node `>=24`. Runtime pins during capture: Node 24.21.0, Vite 8.0.16, React Router 7.18.2, i18next 26.4.2, i18next-http-backend 4.0.2, i18next-browser-languagedetector 8.2.1, Playwright 1.63.0, Chromium 153.0.8010.12.

The captured build has 342 files / 10,309,114 raw bytes and deterministic manifest SHA-256 `d9cfe2cfcc00e0c2b3e5e98bacc32003f4a1e1dde38f5fd94f8b0058a18fc85c`. The manifest hashes sorted records of relative path, raw file size, and file SHA-256. The JSON also lists the exact asset names and hashes and the SHA-256 hashes of source files inspected for the audit.

With the source checkout and its dependencies installed, the replay command is:

```sh
OPENHANDS_SOURCE=/path/to/openhands-locale-audit \
  node benchmark/real-apps/openhands-native-cold-trace.mjs
```

It writes the raw capture under `benchmark/real-apps/results/openhands-native-cold-fr.json`. Set `OUTPUT_JSON` to choose another destination. Use the Node 24 runtime required by the source package.

The script starts a local static HTTP/1 server over the existing build, disables browser cache, opens a fresh context, and serves text assets using gzip level 6 with their encoded `Content-Length`. The browser profile is CDP latency 80 ms, 20 Mbps down/up, and 3× CPU slowdown. CDP latency is the browser’s per-request emulation value; this is intended as an approximately 80 ms RTT profile, not a calibrated network measurement. Captured byte counts are compressed entity bytes, excluding TLS, headers, and synthetic MSW response bodies. This local server is not a CDN/HTTP2/HTTP3 simulation.

## Seed and fixture

The browser context starts at `fr-FR`, with `i18nextLng=fr` and `context.locale=fr`. The mock backend storage is seeded as follows:

```json
{
  "openhands-backends": [
    { "id": "probe-local", "name": "Mock local", "host": "http://127.0.0.1:8000", "apiKey": "mock-key", "kind": "local" }
  ],
  "openhands-active-backend": { "backendId": "probe-local", "orgId": null },
  "openhands-onboarded": "1"
}
```

The trace uses the app’s existing `VITE_MOCK_API=true` MSW handlers. The mock `/api/settings` response sets `misc_settings.app_preferences.language` to `null`; the API adapter hoists that null to `settings.language`, so `root-layout.tsx` does not switch i18next back to the legacy default `en`. The exact fixture path and source hashes are in the JSON. The document language timeline is recorded from the static shell (`en`) to translated client state (`fr`), then remains `fr` through the 1,500 ms post-ready observation. No third locale catalog request occurred.

## Trace result

The home-ready marker requires both `[data-testid="home-screen"]` and the exact French string `Sur quoi voulez-vous travailler ?`, with `document.documentElement.lang` starting with `fr`.

Under the specified profile, the browser observed DOMContentLoaded at 389 ms and the translated home marker at 2,453 ms (`performance.mark`; Playwright’s polling observation was 2,466 ms). The app showed `html.lang=fr`, `dir=ltr`, and no page-level JavaScript errors.

The initial static HTML is 4,657 gzip bytes. Its modulepreloads start immediately; the generated locale requests do not start until about 1,059 ms after navigation, once the client entry and its module graph have evaluated. The MARS probe and both catalog requests then run together:

| Resource | Browser request / response | Raw / gzip bytes |
| --- | ---: | ---: |
| `/mars/health` | 1,055 / 1,137 ms | 27,739 / 4,657 |
| `/locales/fr/openhands.json` | 1,059 / 1,141 ms | 219,697 / 57,437 |
| `/locales/en/openhands.json` | 1,064 / 1,141 ms | 195,166 / 52,670 |

`/mars/health` receives the static SPA fallback HTML with status 200; the bridge probe rejects it as non-JSON. The locale JSON responses finish about 1.31 seconds before the home-ready mark. The server handled 238 static requests (231 JavaScript, 3 CSS, plus HTML/other files), all gzip encoded, totaling 1,802,810 response entity bytes during the capture. Approximately 1,786,425 static encoded bytes had been served by the home-ready mark. Fifty static requests and 829,935 encoded bytes precede the first catalog request. The exact unfiltered server and browser event lists are retained in the JSON.

The MSW fixture leaves `/api/meta-profiles` and `/api/automation/sdk-version` unhandled; those requests fail against `127.0.0.1:8000` (three failed attempts total, two distinct paths). They are recorded as fixture limitations; the app and mocks were not changed. There were 282 browser requests, 279 responses, and zero page errors.

## Source audit and next experiment boundary

`src/i18n/index.ts` configures the HTTP backend with `/locales/{{lng}}/openhands.json`, `fallbackLng: "en"`, one `openhands` namespace, and 15 supported locales. `src/i18n/translation.json` has 2,903 translation definitions; the generated `I18nKey` enum has 2,893 members. This run requested only French and English, concurrently. The enum is application TypeScript and removing or replacing it would require an application change; it is outside a Paraglide compiler-only optimization claim.

`src/entry.client.tsx` awaits `Promise.all([waitForI18n(), installMarsWebBridge()])` before hydration. The capture shows the bridge request and selected/fallback catalogs beginning within roughly 9 ms of each other. Any future locale preload or top-level-await experiment must preserve this concurrency; sequencing the MARS probe behind locale initialization would add a network wait.

This trace identifies one bounded compiler experiment: test whether locale data can become available earlier than the current client-entry initialization without changing the i18next settings fallback or serializing the MARS probe. The catalogs are about 110 KB gzip together and begin only after the JS entry evaluates, so earlier preload may reduce a wait. However, they finish well before the translated home marker, while the app continues requesting and evaluating a large eager/preloaded JS graph. The capture therefore does not establish that catalogs are the final readiness bottleneck or that an optimization can improve readiness by more than 10%. The `PrefetchPageLinks` in `src/routes/home.tsx` and the eager `I18nKey` module are visible application-level contributors, but changing them is outside a compiler-only experiment. A candidate should first preserve locale parity, fallback, settings behavior, and MARS parallelism, then be compared against an unmodified production `build:app` artifact with equivalent backend response fixtures outside the client bundle. The seed remains useful for reaching the home route; the mock-mode artifact here is only a feasibility baseline.
