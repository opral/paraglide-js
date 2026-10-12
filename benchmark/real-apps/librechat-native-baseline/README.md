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

## Native selected-locale preload control

The isolated native control inserts a classic inline script in the HTML head.
It maps the already-built `locale-<locale>` chunks from the Vite bundle, then
uses the app's cookie → JSON-or-raw local storage → navigator precedence and
the aliases from `client/src/locales/i18n.ts` to add one `modulepreload`. It
does not alter application JavaScript, translation data, or the native
i18next initialization path. The source and config patch are archived as
`native-locale-preload-control.ts` and `native-preload-config.patch`.

To reproduce in a clean checkout, apply the pinned control with:

```sh
export LIBRECHAT_SOURCE=/path/to/LibreChat
export NODE_BIN=/path/to/node-24.16.0/bin/node
export NPM_BIN=/path/to/node-24.16.0/bin/npm
bash benchmark/real-apps/librechat-native-baseline/build-native-preload-control.sh
```

This runs `npm ci` and `npm run frontend` with the benchmark-only Vite plugin.
The measured build used Node `24.16.0`, npm `11.13.0`, and Vite `8.2.2`; it
took 8.83 seconds and peaked at 3,701,872 KB RSS. `native-preload-build.log.txt`
and `native-preload-build.time.txt` retain the build output and GNU `time`
report. The plugin updates the pre-existing `.br` and `.gz` HTML sidecars after
the post-order HTML hook, using the app's Brotli quality 5 and gzip level 9.
The first smoke caught stale sidecars from the earlier version; that invalid
artifact was discarded. The final verifier confirms that decompressed HTML
sidecars match `index.html`, all 386 output filenames match the native build,
and all 98 JavaScript files are byte-identical. Only `index.html` and its two
compressed sidecars differ. Hashes and checks are in
`native-preload-dist-check.json`; `native-preload-dist-files.sha256` records
the candidate's complete 386-file output tree. The control source SHA-256 is
`9b95b776cb1e0cba9584d59d4f1f1dc084358c5d762fd47a754b1c6d41cbb517`, and the
Vite config patch SHA-256 is
`7ed113ead74a9614c9b447ef2467e487d877f1cb269cce9ce9edaac25ef762e9`.

`verify-preloader-vm.mjs` exercises seven selection cases: the French regional
alias, cookie-over-storage precedence, JSON storage alias, raw storage alias,
`auto` through browser language, Arabic regional alias, and English/invalid
fallback with no separate chunk. This VM check validates locale selection and
the generated preload link only. It does not verify document direction or RTL
rendering; the only browser locale exercised was `fr-FR`.

The corrected French smoke and the one-pair profiles are saved in
`native-preload-fr-smoke.json`, `native-preload-desktop.json`, and
`native-preload-mobile.json`. They used Playwright `1.61.1`, fresh contexts,
disabled browser cache, blocked service workers, a static fixture with
`Cache-Control: no-store`, and Brotli responses over HTTP/1.1. Both variants
rendered the same French login copy and placeholders, reported `lang="fr"`,
and had no page or console errors. The native document response and preload
control response both used `Content-Encoding: br`. The candidate preload
requested `/assets/locale-fr.D7dm3wbf.js` at 97 ms on desktop and 172 ms on
mobile; native i18next requested it at 1,483 ms and 10,862 ms, respectively.
However, advancing this request did not materially improve translated UI
readiness:

| Profile | Variant | French-ready | FCP | LCP | Fonts ready | Encoded resource bodies |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| Desktop, 80 ms / 20 Mbps / 3x CPU | Native | 1,770 ms | 1,664 ms | 1,792 ms | 1,985 ms | 2,331,201 B |
| Desktop, 80 ms / 20 Mbps / 3x CPU | Native preload | 1,728 ms | 1,568 ms | 1,752 ms | 1,944 ms | 2,331,201 B |
| Mobile, 150 ms / 1.6 Mbps / 4x CPU | Native preload | 11,478 ms | 11,144 ms | 11,484 ms | 13,370 ms | 2,331,201 B |
| Mobile, 150 ms / 1.6 Mbps / 4x CPU | Native | 11,514 ms | 11,308 ms | 11,548 ms | 13,769 ms | 2,325,428 B |

The one-pair timing differences are below the 10% gate and are not a stable
performance result. The mobile preload run also made one extra `logo.svg`
request (5,773 encoded bytes), so its body total is not byte-identical despite
the built app assets being identical. No repeated timing batch was run. This
native optimization control does not establish a Paraglide improvement.

Do not interpret the 36.8 KB selected catalog as a hard whole-page savings
ceiling: chunk compression in isolation does not establish its exact marginal
contribution in an application bundle, and readiness could move independently
of total bytes. All captured sizes are specific to this Brotli-Q5 build and
should not be compared as though they were Brotli-Q4 campaign measurements.
