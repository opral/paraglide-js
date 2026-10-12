# Memos `/auth` compiled-output A/B

## Outcome

This optimized-native app does not qualify for a compiler optimization PR. A bounded auth-route integration preserved visible French and English text and removed the two locale catalogs that i18next loads for `fr` plus its English fallback, but the all-locale compiled functions added most of those bytes back.

| Cold `/auth` route, 5 alternating runs | Native i18next | Compiled auth-route adapter | Change |
| --- | ---: | ---: | ---: |
| Median time until translated heading | 1,155.4 ms | 1,155.6 ms | +0.02% |
| Median first contentful paint | 1,104 ms | 1,084 ms | -1.8% |
| Median largest contentful paint | 1,136 ms | 1,120 ms | -1.4% |
| Brotli Q4 encoded response bodies | 684,084 B | 673,593 B | -1.53% |
| Brotli Q4 transfer bytes including headers | 694,584 B | 683,493 B | -1.60% |
| Initial static requests | 35 | 33 | -2 requests |

The small paint differences are within the observed run-to-run timing spread and do not change the route-ready median. The result is far below the requested 10% gate.

## What was compared

The native app is pinned to `usememos/memos` commit `a668bb8f7e3652be029459bc80bd3bffb86f0542`, with its existing lazy i18next backend and English fallback. The frontend build passed on Node 24.21.0, pnpm 11.0.1, and Vite 8.0.11.

The candidate is a scratch-only `/auth` integration using generated Paraglide message functions for 21 literal calls across six auth components (16 distinct keys). The i18next backend remains enabled for every other route; on `/auth` it returns an empty resource object instead of importing locale JSON. Calls receive the selected i18next locale through Paraglide's per-call `locale` option, while `react-i18next` remains responsible for React language-change notifications. French startup and a live French-to-English switch both produced exact visible-text parity in all five pairs, with no page errors and the same empty Connect protobuf API stubs.

The native route downloads Brotli-encoded `fr` and `en` catalog chunks of 17,193 B and 14,803 B (31,996 B total), plus its 18,223 B i18next chunk. The candidate adds 20,388 B to the main JS body and 1,067 B to the i18n chunk while removing those two locale files. Net route savings are 10,491 B, only 1.53% of the native encoded response bodies. This also shows why comparing catalog-only bundles would overstate the user-facing gain.

## Method and scope limits

Runs alternated native-first and candidate-first in five fresh Chromium contexts, using Chrome 143, browser locale `fr-FR`, 20 Mbps down / 5 Mbps up, 80 ms latency, 3× CPU slowdown, and same-origin Brotli Q4 responses. The measured route was `/auth`; the harness returned empty unary Connect protobuf responses for refresh-token, instance profile/settings, and identity-provider requests. Startup metrics were captured before opening the language picker. The locale switch was then exercised and compared.

This was a bounded app adapter, not a complete Memos migration. It rewrites only statically keyed auth-route calls, retains i18next and `react-i18next`, and leaves other routes native. The generated message modules include all 46 locales for each retained key. The catalog parity harness covers 911 included keys; it excludes the same two plural-form keys on both sides. The local Brotli server models equal compression settings, not a particular production CDN. This route result cannot establish whole-app performance or a general library-wide win.

## Reproduction

From the pinned Memos checkout, build the native output before running the integration script:

```sh
npx --yes --package=node@24 -c 'node ./node_modules/vite/bin/vite.js build'
```

Then use the generated catalog at `.real-apps/memos/baseline/paraglide` and its adjacent `mapping.json` to prepare a detached scratch checkout and build again:

```sh
node benchmark/real-apps/memos-auth-integrate.mjs \
  --app-root /path/to/memos-scratch \
  --catalog /path/to/paraglide-real-apps/.real-apps/memos/baseline/paraglide \
  --mapping /path/to/paraglide-real-apps/.real-apps/memos/baseline/mapping.json
npx --yes --package=node@24 -c 'node ./node_modules/vite/bin/vite.js build'
MEMOS_NATIVE_DIST=/path/to/native-dist \
MEMOS_CANDIDATE_DIST=/path/to/candidate-dist \
MEMOS_TRIALS=5 \
node benchmark/real-apps/memos-auth-ab.mjs
```

The raw five-pair report is saved in the ignored `.real-apps/memos-ab/route-ab.json` working artifact. The generated catalog metadata records the same app commit and catalog hash as the isolated parity run.
