# OpenHands production French startup trace

This is one cold browser trace of the pinned, unmodified production Vite build. It replaces the earlier mock-mode run as the relevant production baseline. It is an ordering and feasibility observation, not a timing distribution or a claim that a compiler change can improve startup by a particular amount.

## Source, build, and replay

The app source is `/root/repos-iii/openhands-locale-audit`, clean at `02e02ae0c92ebb033afcf2fb399bd3683df82ca8` (`@openhands/agent-canvas` 1.27.0). The production build used Node 24.21.0 and `npm run build:app` (`npm run make-i18n && react-router build`) with `VITE_MOCK_API` unset. Installed versions were Vite 8.0.16, React Router 7.18.2, i18next 26.4.2, i18next-http-backend 4.0.2, i18next-browser-languagedetector 8.2.1, Playwright 1.63.0, and Chromium 153.0.8010.12.

The production artifact contains 342 files / 10,309,087 raw bytes. Its sorted relative-path/size/file-SHA manifest is `1b9b1b37d0b12dbf58807ecab9ca813a9101c2c19cf36e8e3be9a04177eae28f`; the trace JSON includes the complete asset list and inspected source-file hashes. The output still contains a copied `mockServiceWorker.js` and lazy MSW-related browser chunks. The timed request graph did not request these files or start a service worker; this report does not claim the output directory is free of MSW code.

The browser API fixture was captured once from the app’s existing `VITE_MOCK_API=true` MSW build, then replayed outside the production bundle with Playwright `page.route`. It contains 21 request keys, 25 successful response instances, and 21,176 response-body bytes, all from canned mock handlers; it contains no personal data. The fixture hash is `c12f668aa60efe7673c960ed77be77836cb9d44faf3432786339d0cc77872d35`. Two API paths are intentionally unhandled by the existing MSW fixture and their observed failures are replayed: `/api/meta-profiles` and `/api/automation/sdk-version` (three failed attempts total). The stored base64 payloads validate against their recorded SHA-256 values, and replay had no unmatched requests.

From an installed checkout of the pinned source, run the mock capture before replacing its output with the production build:

```sh
cd /path/to/openhands-locale-audit
VITE_MOCK_API=true npm run build:mock
cp -a build /tmp/openhands-mock-build
TRACE_MODE=capture \
  OPENHANDS_SOURCE="$PWD" OPENHANDS_BUILD_DIR=/tmp/openhands-mock-build \
  FIXTURE_JSON=/tmp/openhands-api-fixtures.json OUTPUT_JSON=/tmp/openhands-fixture-capture.json \
  node /path/to/luna-openhands-native-baseline/benchmark/real-apps/openhands-production-cold-trace.mjs
npm run build:app
TRACE_MODE=replay \
  OPENHANDS_SOURCE="$PWD" OPENHANDS_BUILD_DIR="$PWD/build" \
  FIXTURE_JSON=/tmp/openhands-api-fixtures.json OUTPUT_JSON=/tmp/openhands-production-trace.json \
  node /path/to/luna-openhands-native-baseline/benchmark/real-apps/openhands-production-cold-trace.mjs
```

The archived [fixture](results/openhands-msw-api-fixtures.json) and [production trace](results/openhands-production-native-cold-fr.json) are the exact outputs from this run. The trace tool can also replay an already captured fixture without rebuilding the app. It serves the existing Vite output with gzip level 6 for compressible text and sets `Content-Length` to the encoded entity size. Browser cache is disabled. The profile uses CDP latency 80 ms, 20 Mbps upload/download, and 3× CPU slowdown; the CDP latency is intended as approximately 80 ms RTT, not a calibrated RTT. Static byte totals exclude headers and TLS, and synthetic API bodies are reported separately. This local static server does not model a CDN or HTTP/2/HTTP/3.

The seed is a fresh `fr-FR` browser context with `i18nextLng=fr`, `context.locale=fr`, a canned local backend at `127.0.0.1:8000`, and `openhands-onboarded=1`. The fixture’s `/api/settings` responses set the user preference language to `null`; the app therefore stays in French rather than switching to its default English language. The response body bytes are held in the fixture file, not embedded in the client artifact.

## Single-trace result

The readiness marker requires the home screen to contain `Sur quoi voulez-vous travailler ?` and `document.documentElement.lang` to begin with `fr`. On this one cold run, DOMContentLoaded was observed at 411 ms and the in-page marker at 4,045 ms (Playwright observed it at 4,058 ms). The page reported `html.lang=fr`, `dir=ltr`, and zero page-level JavaScript errors. The exact request/response records and visible page text are in the JSON.

The locale and Mars requests start together, after the client entry has loaded:

| Request | Started | Response received | Encoded bytes |
| --- | ---: | ---: | ---: |
| `/mars/health` | 1,074 ms | 1,156 ms | 4,654 gzip |
| `/locales/fr/openhands.json` | 1,077 ms | 1,161 ms | 57,437 gzip |
| `/locales/en/openhands.json` | 1,077 ms | 1,161 ms | 52,670 gzip |

The MARS and locale requests begin within about 4 ms of one another. The static SPA server answers `/mars/health` with the fallback HTML and status 200; the bridge rejects its non-JSON body. The three responses finish about 2.88 seconds before the translated-home marker. Together, the two catalogs account for 110,107 gzip bytes in this trace.

The static server handled 234 requests, all gzip encoded, for 1,626,940 encoded entity bytes. The last JavaScript/CSS response before the marker was a small `switch-skeleton` chunk at 3,783 ms; seven JavaScript/CSS responses arrived after the marker. The first `/server_info` API call began at 3,865 ms and returned at 3,871 ms, about 174 ms before the marker. These observations put catalog delivery well before visible readiness on this run; they do not identify a single cause for the remaining startup interval. The main client graph, app initialization, and backend setup are all plausible work in that interval, but this trace is not a CPU profile.

`src/entry.client.tsx` awaits `Promise.all([waitForI18n(), installMarsWebBridge()])` before hydration. The captured request timing is consistent with that existing parallelism. Any compiler-side locale preload experiment must preserve the concurrent MARS startup instead of serializing the bridge behind locale loading.

The browser made 279 requests and received 276 responses; three API calls failed exactly as the recorded MSW fixture did. There were no unmatched API replays. This single trace does not support a performance-distribution claim, a hard upper bound, or an assumption that moving catalog loading earlier would improve readiness by more than 10%. It does show that the catalogs are already loaded well before the translated home marker under this profile, so a compiler-only migration is lower priority until a focused experiment demonstrates a remaining locale-related critical-path wait.

## Source boundary

`src/i18n/index.ts` configures `/locales/{{lng}}/openhands.json`, `fallbackLng: "en"`, the `openhands` namespace, and 15 supported locales. `translation.json` contains 2,903 translation definitions; generated `I18nKey` has 2,893 enum members. `src/routes/root-layout.tsx` changes language only when the saved settings language is truthy. The home route also emits page prefetch links. Replacing the app’s translation enum, changing route loading, or altering settings behavior would be application changes and are outside a Paraglide compiler-only claim.

## Harness note

An initial production replay fixture omitted `/server_info` because the capture filter selected only `/api/` paths. That replay failed into the backend-selection screen and is excluded from the result. The filter was corrected to capture requests to the seeded backend origin, the fixture was recaptured, and the archived production replay then completed in French with all fixture routes accounted for. The final script captures any request to that backend origin, not only `/api/` URLs.
