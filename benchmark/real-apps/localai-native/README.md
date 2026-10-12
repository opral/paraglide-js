# LocalAI optimized native login baseline

Pinned `mudler/LocalAI` at `a551c83465ee538367358f239de5a364ebea9329`. This is a frontend feasibility capture with the original production Vite output and read-only canned API responses. It is not a Paraglide comparison or a live model/backend measurement.

The original i18next HTTP backend loads only `common`, `nav`, and `errors` at initialization; the lazy login page requests `auth`. The Spanish login fetched those four namespaces in Spanish and English, preserving the existing fallback behavior. No other locale or namespace was requested. The page showed `Correo electrónico`, `¿No tienes cuenta? Registrarse`, and `Iniciar sesión con token API`, alongside the original English fallback strings `Sign in`, `to LocalAI`, and `Continue`. A candidate must preserve that mixed fallback output rather than treating it as a translation defect to repair.

The production build uses Vite 8.0.16, React 19.2.8, i18next 26.0.8, react-i18next 17.0.6, and i18next-http-backend 3.0.6. Node 22.23.2/npm 10.9.8 installed the unchanged lockfile. The build completed and retained the original lazy routes, relative base, and source-map/coverage defaults. Only the output directory and dependency manifest were selected through CLI options; no tracked app source changed.

One fresh Chromium context used the campaign Playwright 1.64.0 / Chrome for Testing 156.0.8078.4 runtime, cache and service workers disabled, 80 ms latency, 20 Mbps download, 2 Mbps upload, and 3× CPU throttling. The app's pinned Playwright browser was absent, so the capture used that separately installed campaign runtime. Any candidate comparison must use the same runtime. The probe waits for a visible Spanish email label and loaded fonts; it does not report a page-load improvement or use fixed-delay readiness.

| Native requested resources | Count | Encoded bodies |
| --- | ---: | ---: |
| All subresource entries, excluding HTML navigation | 27 | 242,294 B |
| Translation namespace responses | 8 | 9,841 B |
| Canned API responses | — | 338 B |
| Static resources excluding canned APIs | — | 241,956 B |

These body counters exclude transfer headers. The distinct browser `transferSize` sum is 250,394 B and includes headers, still excluding navigation. The raw report records navigation separately. Text/JSON/SVG assets are independently Brotli-compressed at quality 4; binary images and fonts retain their native bytes. The original logo is served from the pinned backend static directory. All responses were 200, with zero page errors, failed requests, or write attempts. Resource timings describe this single native capture only; no candidate timing gate follows from them.

The native output has 299 files and 6,365,370 raw bytes; its entire inventory is in `dist-sha256.json`. `provenance.json` records source hashes, toolchain, output counts, and counter definitions. `login-es-native.json` contains rendered text, request timings, and decoded response hashes. The controlled server mirrors the production root deployment's absolute `<base href>` injection. It returns unauthenticated local-account status, default branding, and empty operations; it refuses writes and does not contact a real backend. Nested reverse-proxy deployment and authenticated home behavior were not exercised.

## Replay

Check out the pin in an isolated app directory, then run its unmodified frontend build:

```sh
cd /path/to/localai/core/http/react-ui
npm ci --no-audit --no-fund
node node_modules/vite/bin/vite.js build \
  --outDir /path/to/immutable/native-dist --manifest --emptyOutDir
```

Start the committed fixture server in one terminal:

```sh
LOCALAI_SOURCE=/path/to/localai \
DIST_ROOT=/path/to/immutable/native-dist PORT=4251 \
  node benchmark/real-apps/localai-native/serve.cjs
```

Run the committed probe in another:

```sh
PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs \
NATIVE_ORIGIN=http://127.0.0.1:4251 \
OUTPUT_FILE=/path/to/login-es-native.json \
  node benchmark/real-apps/localai-native/probe.mjs
```

Keep each built directory immutable and restart its server for new builds. Before a migration, audit namespace defaults, dynamic key access, plural/interpolation/rich-message behavior, language aliases and fallback, and lazy-route switching. No catalog was trimmed to create this baseline. The route-capsule prototype currently covers Vite 8.3.4 only; compatibility with this app's locked Vite 8.0.16 must be tested before using it here.
