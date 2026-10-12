# Source audit: optimized i18next Vite candidates

Read-only screening of user-listed i18next apps beyond Ntfy, Frigate, 3x-ui,
Open WebUI, and OpenHands. No dependencies were installed and no app builds or
browser measurements were run. The byte counts below describe checked-in source
JSON only; they are not estimates of requested route bytes or potential savings.

## Recommended next targets

### 1. LibreChat — best first A/B candidate

Pinned source: `danny-avila/LibreChat`, `e1dfc10449ff713faffacd60273fddcfe2c0a698`
(shallow source clone at `.real-apps/source-audit/librechat`). The Vite client
uses `i18next@24.2.2`, `react-i18next@15.4.0`, and `vite@8.2.2` per the root
`package-lock.json` at this pin.

The client has one `translation` namespace. English is the only locale imported
into the initial resource object; the other 40 supported locales are literal
dynamic imports in the locale loader table. Startup detects cookie, local
storage, or browser language, loads that locale, changes language, and awaits
the whole sequence before rendering React. Language changes use the same loader
and have request IDs to prevent stale concurrent changes from winning. This is
an already optimized selected-locale setup with a direct user-visible metric:
time until the first correctly localized interactive screen. It is the most
promising next real app to test because the native behavior is explicit, the
locale boundary is one namespace, and readiness is defined in source rather
than inferred from a network response.

Source paths and review ranges:

- `client/src/locales/i18n.ts`: English resource and supported locales (lines
  1–57); lazy locale loaders (59–106); cache/failure handling (224–257);
  fallback and i18next initialization (288–306); safe locale switch and awaited
  initialization (308–335).
- `client/src/main.jsx`: `bootstrap()` awaits `initializeI18n()` before
  `root.render()` (16–24).
- `client/vite.config.ts`: actual client Vite build configuration.

There are 41 locale JSON files. Raw English and French file sizes are 230,234
and 111,059 bytes respectively (source-file sizes only). The default English
catalog is itself initially present, so any compiler comparison must include
both the initial route graph and selected non-English locale, and preserve the
native locale detection, fallback, error, direction, and switch behavior. No
route-level measurement has established a win.

SHA-256 source evidence:

| File | SHA-256 |
| --- | --- |
| `client/src/locales/i18n.ts` | `66c38725243d288c0019a0886550bd94fff80b6e3217ef7ec697d41179732855` |
| `client/src/main.jsx` | `988177fae209e0c14e1090df80df9f8b751ece29cce783b69d3b909e3420aba1` |
| `client/vite.config.ts` | `e67ae4a0df1ceffc62744ab902cb90f78e606a689809a8e10d20a8a3ad906278` |
| `client/package.json` | `a89e73009092952fd9e215348b4afa62159ad8188406d6e8213a68eb74f00cdd` |
| root `package-lock.json` | `567b3526201947acad8995958d6411a08a11abf2aff632c30db11ba1089a7045` |
| `client/src/locales/en/translation.json` | `ef720ec6d70ca9b5aa525b6db1c4886bd879413b2f282b06c81d7c4cd887048c` |
| `client/src/locales/fr/translation.json` | `db1dcf07f2c3b533121bdcfee9ce8af53c8af16796124d1606a94b69948f59e7` |

### 2. LocalAI — best namespace-loading candidate

Pinned source: `mudler/LocalAI`, `a551c83465ee538367358f239de5a364ebea9329`
(shallow source clone at `.real-apps/source-audit/localai`). The React app is
under `core/http/react-ui`; its lock pins `i18next@26.0.8`,
`react-i18next@17.0.6`, and `vite@8.0.16`.

The i18next HTTP backend fetches detected-language catalogs with English
fallback from `/locales/{{lng}}/{{ns}}.json`. It initializes only `common`,
`nav`, and `errors`; the declared namespace set has 22 entries. React suspense
is enabled. The top-level suspense boundary renders a boot spinner until
required translations arrive, and router pages are lazy-loaded. The login page
uses the `auth` namespace and the Home page uses `home`, so the login and
authenticated home routes exercise selected-language namespace fetches without
preloading every namespace. This is a strong follow-up if the campaign wants to
test route/namespace loading rather than replacing LibreChat’s locale chunks.

The production serving path and locale selection need to remain matched: the
HTTP backend uses `apiUrl()`, and `languageChanged` updates `<html lang>`. A
candidate should verify the actual `/login` first-ready text and Home route
after switching, with both selected and fallback locale semantics preserved.
The checked-in UI source contains 8 locale directories and 115 JSON files; the
English locale has 22 files / 269,389 raw bytes, while Spanish has 13 / 60,457
raw bytes. The login `auth.json` source files are 8,053 bytes (English) and
5,281 (Spanish). These numbers are inventory only, not network measurements.

Source paths and review ranges:

- `core/http/react-ui/src/i18n/index.js`: supported locales and namespace list
  (7–41); HTTP backend, detected/fallback locale, initial namespaces and
  Suspense setting (43–65).
- `core/http/react-ui/src/main.jsx`: top-level Suspense boot fallback (21–45).
- `core/http/react-ui/src/router.jsx`: route-level lazy loader and route
  preloaders (27–79); lazy route registrations (81 onward).
- `core/http/react-ui/src/pages/Login.jsx:21` and
  `src/pages/Home.jsx:58`: route-specific `auth` and `home` namespaces.

SHA-256 source evidence:

| File | SHA-256 |
| --- | --- |
| `core/http/react-ui/src/i18n/index.js` | `e9959bd5fc712a2205323e2ac5d2cb8bfd6371f879d3eea04da459fca006fb64` |
| `core/http/react-ui/src/main.jsx` | `db3c7c672507ed38980266fd0cdfdf03a0745b2c80bcf3b556cf50c8be26d17b` |
| `core/http/react-ui/src/router.jsx` | `001dd17cacf1a59a25de30ea7bc66ba4cc2b7a80180dd52ac6dfa4b03cd39390` |
| `core/http/react-ui/package.json` | `6cedc34c65b9e4be3e638e1172eee48f02ab0a98656c70caa123d4fc9272dbb7` |
| `core/http/react-ui/package-lock.json` | `894c16795cbf487770a45bb0e46c8ed31e58b194312fed20399758d0635a1ee3` |

### 3. Airflow — valid optimized setup, lower priority

Pinned source: `apache/airflow`,
`7f0d50cffc61a48650590078f6832b349860322b` (shallow source clone at
`.real-apps/source-audit/airflow`). The Vite UI lock pins `i18next@26.4.2`,
`react-i18next@17.0.15`, and `vite@8.3.3`.

Airflow fetches the selected language and English fallback as HTTP JSON from
`/static/i18n/locales/{{lng}}/{{ns}}.json`, and configures 8 startup namespaces.
The route has meaningful translated surfaces in the nav and dashboard, but
`config.ts` waits for version and plugin-language API calls before calling
`i18n.init`, while `main.tsx` renders the React root without awaiting that
initialization. The initialized namespace list is broad rather than route
scoped, and plugin-contributed languages add a dynamic server behavior that a
static compiler adapter must retain. This is worth keeping as a lower-priority
candidate, but I would measure LibreChat or LocalAI first.

The public locale tree has 21 language directories / 210 JSON files; raw English
and French trees are 62,210 and 70,847 bytes. The configured namespaces are
`common`, `dashboard`, `dags`, `admin`, `browse`, `assets`, `components`, and
`hitl`; the source tree also has additional files, so the runtime resource
inventory must use the configured set rather than assuming every checked-in
file is loaded. Again, these source sizes are not route transfer estimates.

Source paths and review ranges:

- `airflow-core/src/airflow/ui/src/i18n/config.ts`: supported locales and
  startup namespace list (31–68); HTTP backend init and path (154–172); version
  and plugin-language requests before initialization (179–186).
- `airflow-core/src/airflow/ui/src/main.tsx`: React root is rendered with the
  i18next provider but no readiness wait (107–123).
- `airflow-core/src/airflow/ui/src/router.tsx`: `/` landing page and `/home`
  dashboard routes (103–113).

SHA-256 source evidence:

| File | SHA-256 |
| --- | --- |
| `airflow-core/src/airflow/ui/src/i18n/config.ts` | `60cf3ec686af53e97de6f9eb4b371550d4ee7b101378d11384a6b4fc5f1807df` |
| `airflow-core/src/airflow/ui/src/main.tsx` | `7153d4c30dc06219274d8f0296c0bd0a819a0ec6172429c4976a37f0b60627a9` |
| `airflow-core/src/airflow/ui/src/router.tsx` | `a39e5ae3aa4030499bdfa9b2d9f1dc7f01becd4d26b11824efb2e72a5ebf77c5` |
| `airflow-core/src/airflow/ui/package.json` | `595d24f20f5f1160f8045145244e7672fe3f71bb77abc36cdef80054f1073dce` |
| `airflow-core/src/airflow/ui/pnpm-lock.yaml` | `6f0b4592b1606c938e9cb4a48a49cbd529e19e73f9fb50366a30a05150db64f2` |

## Rejected source-only check: Jan

Pinned source: `janhq/jan`, `2ba3c5ca2c60c705e7386dbf24475834a2d477d5`
(shallow source clone at `.real-apps/source-audit/jan`). Although the app is
listed as i18next-using, its current `web-app/src/i18n/setup.ts` does not import
i18next. It provides a custom compatibility implementation and eagerly reads
all locale JSON with `import.meta.glob(..., { eager: true })`. That is not an
optimized i18next integration and should not be added under the current
optimized-native-only criterion.

Source SHA-256: `web-app/src/i18n/setup.ts`
`2a0f21556b8d770f3de1fdfdafa026e7cbc35dc6ec2d6e1d18e23c847afb0a8c`.

## Reproduction and scope

The source clones under `.real-apps/source-audit/` were fetched read-only with
shallow Git clones on 2026-10-12. Reproduce the source pins with:

```sh
git init librechat && git -C librechat fetch --depth=1 https://github.com/danny-avila/LibreChat.git e1dfc10449ff713faffacd60273fddcfe2c0a698 && git -C librechat checkout FETCH_HEAD
git init localai && git -C localai fetch --depth=1 https://github.com/mudler/LocalAI.git a551c83465ee538367358f239de5a364ebea9329 && git -C localai checkout FETCH_HEAD
git init airflow && git -C airflow fetch --depth=1 https://github.com/apache/airflow.git 7f0d50cffc61a48650590078f6832b349860322b && git -C airflow checkout FETCH_HEAD
git init jan && git -C jan fetch --depth=1 https://github.com/janhq/jan.git 2ba3c5ca2c60c705e7386dbf24475834a2d477d5 && git -C jan checkout FETCH_HEAD
```

This is a source screen only. It does not establish compilation compatibility,
full-page parity, optimized-native route bytes, or a performance gain. Next
campaign work should start with one real first-ready route in LibreChat or
LocalAI, then require complete visible-text and locale-switch parity before any
browser timing batch.
