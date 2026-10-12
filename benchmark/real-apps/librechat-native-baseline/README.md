# LibreChat native i18next baseline

This is a pinned, native-only baseline for the LibreChat `/login?redirect=false`
route. It records the existing i18next loading path and one cold French login
trace. It is not a Paraglide comparison or a performance claim.

## Pinned inputs and toolchain

- Source: `LibreChat-AI/LibreChat` commit
  `e1dfc10449ff713faffacd60273fddcfe2c0a698`.
- `package-lock.json`: SHA-256
  `567b3526201947acad8995958d6411a08a11abf2aff632c30db11ba1089a7045`.
- `client/package.json`: SHA-256
  `a89e73009092952fd9e215348b4afa62159ad8188406d6e8213a68eb74f00cdd`.
- Source files used for the loading audit are listed with hashes in
  `source-files.sha256`.
- Node `24.16.0`, npm `11.13.0`, Vite `8.2.2`, i18next `24.2.2`, and
  react-i18next `15.4.0`.
- The Vite config emits Brotli quality 5 and gzip quality 9 sidecars. The static
  fixture serves `.br` when the browser advertises Brotli.

The checked-in app source was not modified. Build output is not checked in;
`dist-files.sha256` contains a sorted SHA-256 entry for each of the 386 files in
the frozen `client/dist` tree. The SHA-256 of that manifest is
`2d6a6b06053e598448fff7845a25abdaed8dc77261a29bd8a02fc09bd396e0b1`.

## Reproduce the native build

Provide a clean checkout at the pinned commit and Node/npm executables matching
the versions above:

```sh
export LIBRECHAT_SOURCE=/path/to/LibreChat
export NODE_BIN=/path/to/node-24.16.0/bin/node
export NPM_BIN=/path/to/node-24.16.0/bin/npm
bash benchmark/real-apps/librechat-native-baseline/build-native.sh
```

The script checks the source commit and tool versions, then runs `npm ci` and
`npm run frontend`. The captured frontend build used those commands and took
8.90 seconds wall time with a 3,638,368 KB maximum resident set. See
`frontend-build.log.txt` for a readable ANSI-stripped copy and
`frontend-build.log.raw.gz` for the exact captured output. The uncompressed raw
log SHA-256 is
`dccefe6e262b3833967af53ffb45692047842e50d85fd4d2941011b95a4a1d21`; the
compressed archive SHA-256 is
`3c8827905e8b4f32622965cc09275b7867dd8d571a548afbca5959571fa510f4`.
`frontend-build.time.txt` contains the original GNU `time -v` report.

## Reproduce the static route fixture

After building, from the pinned source checkout:

```sh
LIBRECHAT_DIST_ROOT="$LIBRECHAT_SOURCE/client/dist" \
  node /path/to/librechat-native-baseline/serve-static.cjs
```

In another shell, provide Playwright and run the cold route probe:

```sh
PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs \
  ORIGIN=http://127.0.0.1:4176 \
  OUTPUT_FILE=/tmp/librechat-native-route.json \
  node /path/to/librechat-native-baseline/probe-native.mjs
```

The fixture returns read-only responses for the config, banner, refresh, and
unauthenticated user APIs. It does not emulate a logged-in backend. The probe
uses `lang=fr-FR`, disables browser cache, applies 80 ms RTT, 20 Mbps download,
2 Mbps upload, and 3x CPU throttling, then waits for the French login title,
email and password labels, and `document.fonts.ready`. The raw captured result
is `native-route.json`; it reports page errors, API statuses, resource timings,
and both encoded body and transfer sizes.

Playwright can be supplied through `PLAYWRIGHT_MODULE` rather than installed in
the LibreChat checkout. The run recorded here used Playwright 1.64 and the
installed Chromium headless shell.

## Native loading path and route evidence

`client/src/locales/i18n.ts` statically includes English and exposes 41
supported locales. It dynamically imports the selected non-English locale
through a 40-entry loader map, normalizes region aliases such as `fr-FR` to
`fr`, adds the resource bundle, and awaits `i18n.changeLanguage` before
`client/src/main.jsx` renders React. The initial locale priority is the `lang`
cookie, then JSON-or-raw local storage key `lang`, then the browser language;
an unknown value resolves to English. The configured Vite output names these
dynamic chunks `locale-<locale>` and the service worker keeps locale chunks out
of precache.

In this one cold trace, `/assets/locale-fr.D7dm3wbf.js` started at 1,492 ms and
finished at 1,588 ms. It transferred 36,854 encoded bytes (37,154 bytes
including headers) and decoded to 158,679 bytes. French UI was visible at
1,825 ms; FCP was 1,672 ms, LCP 1,848 ms, and fonts were ready at 2,304 ms.
There were 54 resource entries excluding the navigation entry, totaling
2,325,484 encoded body bytes or 2,341,384 transfer bytes including headers.
The document navigation was 4,920 encoded body bytes. This single run does not
establish a stable timing effect.

The build has an obvious native fairness control worth testing before a
compiler comparison: have a temporary Vite plugin add a `modulepreload` for the
already-built selected `locale-<locale>` chunk in `index.html`, before the app
module entry. The plugin can map locale names to emitted chunk filenames at
build time, preserving all 41 catalogs and application code. Its early script
must mirror the app's cookie → local storage → navigator precedence, locale
normalization/aliases, and invalid-cookie-to-English behavior. This is a
proposal only; this archive contains no modified app or rebuilt preload
control. A fair experiment should first compare that control with the untouched
native route under the same browser profile.

Do not interpret the 36.8 KB selected catalog as a hard whole-page savings
ceiling: chunk compression in isolation does not establish its exact marginal
contribution in an application bundle, and readiness could move independently
of total bytes. All captured sizes are specific to this Brotli-Q5 build and
should not be compared as though they were Brotli-Q4 campaign measurements.
