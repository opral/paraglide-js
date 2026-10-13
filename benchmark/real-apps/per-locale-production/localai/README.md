# LocalAI Spanish login per-locale browser evidence

This package records a controlled, read-only browser comparison between a tuned native i18next login path and a private fixed-locale Paraglide prototype. It measures only `/login` in Spanish with canned auth, branding, and operations APIs. It is not a live LocalAI backend test, and its compiler result is from private compiler patches, not the public compiler release or a public compiler PR.

## Measured result

Five alternating native/candidate pairs per profile completed with no page errors, failed requests, blocked writes, or non-200 API responses. All ten captures in each profile rendered the same login text and selected `es`. Values below are medians; negative deltas mean the candidate was lower. Raw rows and full response/resource reports are under `raw/repeats/`; machine-readable medians are in `measurements.json`.

| Profile | Login controls ready | Last observed LCP | Encoded bodies + HTML | Transfer bytes + HTML |
| --- | ---: | ---: | ---: | ---: |
| Desktop native → candidate | 1230.2 → 1204.1 ms (−26.1 ms) | 824 → 800 ms (−24 ms) | 1,157,613 → 1,149,335 B (−8,278; −0.715%) | 1,166,013 → 1,158,035 B (−7,978; −0.684%) |
| Mobile native → candidate | 2821.5 → 2220 ms (−601.5 ms; −21.3%) | 2564 → 2168 ms (−396 ms) | 1,157,613 → 1,149,335 B (−8,278; −0.715%) | 1,166,013 → 1,158,035 B (−7,978; −0.684%) |

The login-ready marker is the first time the Spanish email label and Continue button are both visible. LCP is reported separately: the probe records it at readiness and after all fonts and document images have decoded plus two animation frames. The last observed LCP was the `H1` in every capture; it matched FCP. `afterStartupAssets.observedAtMs` is a later settled observation, not a user-visible readiness time.

The body-byte counter includes the HTML navigation and every resource whose request started by the login-ready timestamp, then waits for those requests to finish before reading their encoded body sizes. That includes the 914,776-byte logo request, which starts before readiness and often finishes several seconds later on the simulated mobile profile. Body sizes exclude HTTP headers; the separate transfer totals include them. The same logo is about 79% of the measured body bytes, so the 8,278-byte page-body reduction is small even though mobile login readiness improves substantially.

The mobile waterfall shows the candidate startup entry falling from 96,817 to 74,493 encoded bytes (−22,324 B) and completing at a median 1,881.2 → 1,311.8 ms. The native path then requests one `/locales/es/auth.json`; the candidate requests two lazy `/assets/auth-*.js` chunks. Those auth resources finish at medians 2,158.8 ms native and 1,964 ms candidate. Subresource count rises from 27 to 28, excluding the HTML navigation, so the observed result does not come from fewer requests. The lighter fixed-locale startup entry and earlier completion of its auth resources align with the shorter mobile critical path; this five-pair run does not establish that the same gain will hold on other routes or networks.

## Scope and limitations

- The native comparison is deliberately tuned: [native-bundled-auth-fallback.patch](patches/native-bundled-auth-fallback.patch) bundles English `auth` fallback data, requests `auth` at startup on login/invite routes, and starts `common`, `nav`, and `errors` in the background. Results describe this control, not untouched upstream LocalAI.
- The candidate was built with private namespace-facade and Vite 8 host-marker patches. Their provenance and patch files are included under `source/private-compiler/`. Do not present this as evidence for output from the public compiler release.
- The candidate build produced eight locale outputs: 3,961 files and 103,523,056 raw bytes combined. The tuned native control build produced 298 files and 6,308,509 raw bytes. Those are build-output totals, not browser-transfer totals; this experiment does not measure deployment storage or CDN cost. Only Spanish was opened in Chromium.
- The fixture selects the candidate's locale-specific HTML using the `localai-language` cookie. Its fixed-locale runtime writes the selected locale to storage/cookie and calls `window.location.reload()` on `changeLanguage`; native `LanguageSwitcher` calls i18next `changeLanguage()` in place. No language-switch interaction was exercised, so these captures do not establish switching parity.
- The catalog build used all 115 native catalog files, 8 locales, 22 namespaces, 5,368 English keys, and a 5,550-ID union across locales. Browser validation covers only the Spanish login route, not authenticated home, other locales, or every route.
- Desktop emulation was 80 ms latency, 20 Mbps down, 2 Mbps up, and 3× CPU slowdown. Mobile emulation was 150 ms latency, 1.6 Mbps down, 2 Mbps up, and 4× CPU slowdown. Cache and service workers were disabled. These are simulated profiles on one browser/host, with five observations per variant/profile.

One earlier, unpaired candidate mobile sample had nine `net::ERR_NETWORK_CHANGED` asset failures. It is preserved in `diagnostics/` and excluded from the result. The first bundled attempt also stopped before measurement because the candidate fixture server was not listening; it produced no browser capture. See [diagnostics/README.md](diagnostics/README.md).

## Reproduction

Use fresh LocalAI worktrees at `a551c83465ee538367358f239de5a364ebea9329`, Node 22.23.2, npm 10.9.8, Playwright 1.64.0, and the Chrome for Testing 156.0.8078.4 runtime. In both worktrees run `npm ci --no-audit --no-fund` from `core/http/react-ui/`. Apply [native-bundled-auth-fallback.patch](patches/native-bundled-auth-fallback.patch) to one worktree. In a second worktree, apply [per-locale-app.patch](patches/per-locale-app.patch), then copy `source/per-locale/core/http/react-ui/src/i18n/` and `source/per-locale/core/http/react-ui/.real-apps/localai.inlang/` into the matching app paths. The private compiler patch provenance pins its source base and tested host-8 build; set `PARAGLIDE_COMPILER_ROOT=/root/repos-iii/paraglide-namespace-facades-private` when reproducing in this workspace. The copied project settings file retains that checkout’s absolute message-format plugin module path; if relocating the archive, update its `modules` path to the corresponding private compiler checkout. The exact frozen host-8 `dist` location and hash are in `provenance.json` and `source/private-compiler/`. `source/per-locale-build-summary.json` is the pre-browser build record; this package adds the browser validation below.

From each worktree's `core/http/react-ui/` directory, build into a separate immutable directory:

```sh
node node_modules/vite/bin/vite.js build --outDir /tmp/localai-native-dist --manifest --emptyOutDir
PARAGLIDE_COMPILER_ROOT=/path/to/paraglide-namespace-facades-private \
  ./node_modules/.bin/vite build --outDir /tmp/localai-candidate-dist
```

Start one read-only fixture server for each output. Set `LOCALAI_SOURCE` to the corresponding LocalAI checkout root, and `DIST_ROOT` to its build output:

```sh
LOCALAI_SOURCE=/path/to/native-control DIST_ROOT=/tmp/localai-native-dist PORT=4324 \
  node harness/serve.cjs
LOCALAI_SOURCE=/path/to/candidate DIST_ROOT=/tmp/localai-candidate-dist PORT=4322 \
  node harness/serve.cjs
```

In a second terminal, run the alternating five-pair capture with the campaign Playwright module:

```sh
cd /path/to/this/package
PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node harness/run-five-pair.mjs
```

The package-local runner writes raw captures under `raw/repeats/` and a summary alongside them. The exact original pair runners are retained as `harness/source-run-bundled-*.mjs`; `provenance.json` records their hashes. `harness/probe.mjs` contains the readiness, request-cutoff, and LCP definitions; `harness/serve.cjs` refuses write methods and returns only canned APIs and build/static assets.
