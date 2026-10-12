# AnythingLLM full-app replay

This is a production-build migration experiment for `Mintplex-Labs/anything-llm` at commit `2a10d052a1812d7be12c43f9024072cf26a27a8b` (Vite 4.5.3, i18next 23.12.1). It exercises the app’s eager 31-locale catalog, 1,254 leaf keys, three numeric plural bases, dynamic message calls, rich React `<Trans>` output, and locale picker. The generated migration is benchmark scaffolding, not a supported automatic migration tool.

The native control changes only the locale picker’s list of IDs: it uses the same ordered 31 IDs as the source catalog while retaining the original i18next setup and all translation resources. The Paraglide version replaces that metadata import with generated `locales` and removes browser imports of i18next and the resource catalogs. Catalog parity covers 38,192 ordinary key/locale cases, 837 numeric plural cases, and 9 regional fallback cases; rich-message parity covers 496 `<Trans>` renders.

The browser comparison measures the local French `/onboarding` route with read-only API fixtures. The report counts Brotli Q4 same-origin subresource bodies and response headers, excluding the HTML document. Authenticated and backend-dependent routes are outside the experiment. These local measurements do not establish field performance or an app-wide average.

## Replay from a fresh worktree

Use Node 22 and pnpm. From the repository root, install and build the compiler, then install the benchmark’s Playwright dependency and headless Chromium:

```sh
pnpm install --frozen-lockfile
pnpm run build
pnpm install --filter @inlang/paraglide-js-benchmark --frozen-lockfile
pnpm --filter @inlang/paraglide-js-benchmark exec playwright install --only-shell chromium
```

Clone and install the pinned app checkout. Its frontend uses Yarn Classic and the committed `yarn.lock`:

```sh
mkdir -p .real-apps
git clone https://github.com/Mintplex-Labs/anything-llm.git .real-apps/anything-llm-source
git -C .real-apps/anything-llm-source checkout --detach 2a10d052a1812d7be12c43f9024072cf26a27a8b
cd .real-apps/anything-llm-source/frontend
corepack yarn install --frozen-lockfile
cd ../../..
```

Run the end-to-end driver from the Paraglide repository root. It checks Playwright and the compiler dist before creating the ignored `.real-apps/anything-migration` artifacts, and refuses to overwrite an existing migration scratch directory:

```sh
PARAGLIDE_COMPILER_DIST="$PWD/dist" \
  node benchmark/real-apps/migrate-anything.mjs "$PWD/.real-apps/anything-llm-source"
```

The driver generates the catalog adapter, checks ordinary/plural and `<Trans>` parity, probes locale selection in Chromium, builds both production inventories, and runs five alternating fresh-context route pairs with cache disabled, 20 Mbps download, 80 ms latency, and 3x CPU throttling. The raw replay is written under `.real-apps/anything-migration/route-perf-report.json`.

## Recorded replay

The separately saved [replay JSON](../results/anything-llm-app-replay.json) records the latest public-worktree rerun: native median FCP/LCP was 760 ms and Paraglide was 532 ms; route transfer was 1,004,417 B and 486,178 B respectively. All five pairs rendered the same text without page errors. The primary result and its prior cross-replicates are reported separately in [dispatch-matrix-results.md](../dispatch-matrix-results.md); do not combine measurements from different builds.
