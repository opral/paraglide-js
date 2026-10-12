# Stirling-PDF client locale payload experiment

This is a derived frontend experiment, not a product migration or an upstream app change. It isolates the Vite client locale-split plugin on Stirling-PDF's real initial route and checks French rendered-text parity. It does not rewrite or build backend code.

The source is pinned to `stirling-pdf@313794c573df5e92d2f020f5ec53d08b264d6e4f`, with i18next 26.3.6 and Vite 7.3.6. The catalog input is the app's 42 `translation.toml` locales. The compiler output has 9,934 distinct raw keys and 9,823 logical message bundles after grouping plural categories. Static messages are compiled; the same `mapping.json`, locale output, runtime, and generated metadata are used in the PR4-vs-PR5 test.

## Results

The PR5 indexed-text plugin is smaller than the PR4 namespace plugin on this route, but its incremental advantage does not reach the 10% user-facing gate on a repeat run.

| Same-app comparison | Encoded route bytes | Paired median FCP | Paired median LCP | Paired median long-task time |
| --- | ---: | ---: | ---: | ---: |
| PR4 namespace plugin → PR5 indexed-text plugin, first 5 pairs | −6.21% | −5.09% | −3.79% | −18.57% |
| PR4 namespace plugin → PR5 indexed-text plugin, independent 10-pair repeat | −6.21% | −5.58% | −2.51% | −0.67% |
| Native i18next → PR5, 10 pairs | +0.90% | −4.53% | −6.52% | −7.06% |

The first five-pair run looked strong on long tasks, but the independent repeat did not reproduce that gain. The repeat is the result to use for qualification. French visible text matched in all PR4/PR5 and native/PR5 runs. The native-to-PR5 comparison also shows why locale-payload savings do not establish a route-level win: the selected French and English locale modules total 233,875 encoded bytes versus 327,956 bytes for native TOML requests (−28.7%), while the complete route transfer is 0.90% larger than native.

The app's Settings language selector also completed a French-to-English switch, including the app's document reload, with the expected translated text and no browser errors. The replay script adjusts the relative HTML base for the local nested-route fallback so that this is a client-only/static-server test.

The browser runs use fresh Chromium contexts and alternate build order. They serve production Vite output with Brotli-Q4, 80 ms simulated RTT, 20 Mbps down, 2 Mbps up, and 3× CPU throttling; API and third-party requests are blocked. LCP is a local frontend lab measurement, not a field Core Web Vital. The 10-pair repeat still shows ordinary host variance, so only paired medians are reported for qualification.

## App adapter limits

The adapter preserves the existing language metadata and selector. It initializes i18next with empty resources to keep `react-i18next` language-change subscriptions, then rewrites literal static `t("key", options)` call sites to generated Paraglide exports. In the production build it rewrote 7,948 static calls across 881 modules and skipped zero calls because of unsupported i18next options.

This is not a complete compatibility layer. Dynamic-key `t(...)` calls and `<Trans>` remain i18next calls against empty resources; module-scope i18next initialization semantics, all option variants, dynamic backend strings, and every lazy route are not validated. The page test only establishes equal visible text for the tested initial French route. The language-switch test establishes one Settings path, not all app behavior. The API error surface is intentionally identical in both builds because backend requests are blocked.

## Reproduction

Use the native checkout pinned above. Build the compiler from PR5 commit `d97b836a9156d6073111fc3f28486152b8ba8455` in an isolated worktree, then generate the shared catalog output with `STIRLING_PARAGLIDE_COMPILER=/absolute/path/to/d97/dist STIRLING_PARAGLIDE_COMPILER_COMMIT=d97b836a9156d6073111fc3f28486152b8ba8455 node benchmark/real-apps/stirling-generate-pr5.mjs` from the Paraglide repository. The generated input hashes are saved in each result JSON to verify that the paired builds use identical message data. From `/root/repos-iii/stirling-paraglide-ab/frontend`, build each variant with the same generated output and environment:

```sh
NODE_OPTIONS=--max-old-space-size=8192 \
STIRLING_PARAGLIDE=1 STIRLING_PR4_CLIENT_SPLIT=1 \
STIRLING_PARAGLIDE_OUTPUT=/root/repos-iii/paraglide-real-apps/.real-apps/stirling/pr5-locale-modules \
UV_THREADPOOL_SIZE=16 ./node_modules/.bin/vite build editor --mode production
```

Copy `editor/dist` to a clean `.real-apps/stirling/app-pr4-plugin/dist`, then use the same command with `STIRLING_PR4_CLIENT_SPLIT=1` replaced by `STIRLING_PR5_CLIENT_SPLIT=1` and copy the output to `app-pr5-plugin/dist`. The plugin revisions are PR4 `76f2c0e759bffbb315701e608bd3ebc4100dac71` and PR5 `d97b836a9156d6073111fc3f28486152b8ba8455`. The sibling worktrees used by the experiment have since advanced, so reproduce the saved comparison only after pinning those revisions in the absolute import paths in the derived `vite.config.ts`.

Run paired browser comparisons from the Paraglide repository:

```sh
TRIAL_COUNT=10 \
BASELINE_LABEL=paraglide-pr4-namespace \
PARAGLIDE_LABEL=paraglide-pr5-indexed-text \
node benchmark/real-apps/stirling-browser-ab.mjs \
  /root/repos-iii/paraglide-real-apps/.real-apps/stirling/app-pr4-plugin/dist \
  /root/repos-iii/paraglide-real-apps/.real-apps/stirling/app-pr5-plugin/dist \
  benchmark/real-apps/results/stirling-pr4-vs-pr5-full-key-ab-repeat.json
```

The app-specific static call rewrite and virtual locale experiment live only in the derived app worktree at `/root/repos-iii/stirling-paraglide-ab/frontend/editor/scripts/`. The locale-switch replay is `benchmark/real-apps/stirling-language-switch.mjs`.

## Route-key experiment status

An earlier lexical route-subset prototype produced a large apparent win, but its checked-in route inventory does not reproduce from the pinned route and catalogs: it reports 1,251/10,042 keys, while the current reproducible substring scan finds 1,307/9,934. The asset list is the same, but the extraction/denominator differs. Therefore `stirling-route-scoped-ab.json` is retained only as an unqualified historical experiment; do not cite its route-byte or LCP deltas as evidence until the inventory is reconciled and the route is rebuilt. `stirling-route-inventory.mjs` and `stirling-route-key-inventory-current.json` make the current lexical procedure explicit. It is still only string matching over initial-route JS, not compiler-proven reachability, and the separately listed dynamic tool-picker keys are manually retained.

The full-key run avoids that route-pruning assumption, but this integration does not demonstrate a 10% repeatable improvement on the whole app route. A consumer-aware compiler split would need to retain dynamic and lazy-route consumers and then pass the same route-level parity and measurement checks.
