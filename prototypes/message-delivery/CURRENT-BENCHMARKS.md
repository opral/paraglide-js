# Current prototype: 20,000-message production measurements

Measured the integrated implementation at compiler commit `8558cc45`, on Apple M5 Pro, macOS arm64, Node 24.22.1 and Vite 8.1.4. Framework versions are the same as [INTEGRATION.md](./INTEGRATION.md). These are generated scale fixtures, not a customer production application.

The catalog contains **20,000 message IDs, three locales (60,000 translations), all with interpolation**. Framework fixtures contain **100 routes using 2,000 message IDs in total**, spread across the routes. All cases emit declarations. README and ignore files are disabled for disk counts. Benchmarks ran sequentially, with three repetitions; framework scenario order rotates per round. OS caches and SDK importer downloads are warm; build processes and generated/build output directories are fresh. Dependency installation, downloading and full CI are excluded.

## Integrated compiler and development

The first column of timings includes SDK catalog loading, compilation, publication and Vite server initialization. Node/package import startup is outside this particular timer. First SSR graph load is separate and includes Vite transformation/module execution of the message barrel graph. Each of three server instances processes five one-message edits: incremental results are the median of 15 observations. That timer includes resource-file writing, the real tracked compiler watch queue, SDK update, output publication and virtual invalidation. It excludes OS watcher delivery, subsequent module fetching and browser reload/hydration.

| Approach                     | Generated disk files | Cold compiler + Vite init | First SSR graph load | One-message incremental compiler update |
| ---------------------------- | -------------------: | ------------------------: | -------------------: | --------------------------------------: |
| Individual disk files        |               40,011 |                   2.409 s |              9.868 s |                                320.1 ms |
| Disk groups of 64            |                  637 |                   0.487 s |              1.119 s |                                324.9 ms |
| Individual virtual + one DTS |                    7 |                   0.625 s |              6.584 s |                                367.6 ms |

Relative to individual disk files, the virtual prototype uses **74.0% less cold compiler time (3.85× throughput)**, loads the first SSR graph in **33.3% less time**, but incremental compiler updates take **14.8% longer**. This does not measure browser HMR latency. Fewer files do not eliminate the individual-message module graph.

## Full production build and application check

Each observation runs a fresh `vite build` process, followed by a fresh application type-check process: `svelte-check --fail-on-warnings` for SvelteKit or `tsc --noEmit` for TanStack Start. All of these checks pass with the examples' normal `skipLibCheck: true` configurations. SvelteKit builds both SSR and client output using adapter-auto; no prerender crawl is included. TanStack builds its client and SSR output. The timer includes Node/framework/plugin startup, SDK loading, message compilation and emission, bundling, minification and physical build artifacts. It excludes source/fixture creation and post-build asset inspection. No linting, application test suite, installation or deployment is included.

| Framework      | Approach                     | vite build | Application type check | Build + check |
| -------------- | ---------------------------- | ---------: | ---------------------: | ------------: |
| sveltekit      | Individual disk files        |     5.26 s |                 4.98 s |       10.29 s |
| sveltekit      | Disk groups of 64            |     1.90 s |                 1.31 s |        3.20 s |
| sveltekit      | Individual virtual + one DTS |     5.43 s |                 3.92 s |        9.35 s |
| tanstack-start | Individual disk files        |     5.42 s |                 5.29 s |       10.79 s |
| tanstack-start | Disk groups of 64            |     1.72 s |                 1.87 s |        3.57 s |
| tanstack-start | Individual virtual + one DTS |     3.50 s |                 4.03 s |        7.53 s |

Each column is a median of observations; medians of separate stages need not add to the median of each measured build-plus-check sum.

Compared with individual disk files, virtual output reduces the combined pipeline by **9.2% in SvelteKit** and **30.2% in TanStack Start**. SvelteKit's build stage alone is **3.2% slower**, while its type check is **21.2% faster**. TanStack's build is **35.5% faster**, and its type check is **23.9% faster**. The framework pipeline matters; these are not universal speedups. Only three repetitions were run, so small differences should not be overinterpreted.

## Standalone TypeScript checking

Fresh TypeScript 5.9.2 CLI subprocesses: strict, noEmit, allowJs false, NodeNext, positive and expected-invalid calls, named/namespace input type consumers. Checks include compiler/library startup. Three rotated repetitions. These measure the current declaration representation and CLI checking, not editor completion latency or TypeScript's own incremental build cache.

| Declaration layout           | skipLibCheck true |        skipLibCheck false |
| ---------------------------- | ----------------: | ------------------------: |
| Individual disk files        |            3.25 s |                    3.83 s |
| Disk groups of 64            |            0.38 s | **FAIL: 936 diagnostics** |
| Individual virtual + one DTS |            2.84 s |                    3.49 s |

The single declaration checks **12.7% faster** than individual declaration files with skipLibCheck true and **9.0% faster** with it false. It is much slower than the grouped declaration control when library checking is skipped.

The grouped-output control has a real emitted-declaration issue: each shard implicitly exports its private `__ParaglideMessage`, `__ParaglideOptionalMessage` and `__ParaglideOptions` helpers, so the declaration barrel has conflicting star exports. The strict check produces 936 TS2308 diagnostics. Failed checks are recorded as failures, not comparable successful timings. This is an issue in grouped output, distinct from the unrelated package/dependency errors previously found in whole-project SvelteKit checks. Individual disk declarations and the single virtual-mode declaration both pass these strict consumers.

## Client output and tree shaking

Total size sums **all client JavaScript chunks**, gzipping each chunk separately, including framework code. It is not initial-page transfer size. Every scenario removes all unused message-ID sentinels in these fixtures. Grouping changes code/chunk layout and compressed size even though the unused messages are eliminated.

| Framework      | Approach                     | JS chunks |  Total JS | Total gzip | Retained unused message IDs |
| -------------- | ---------------------------- | --------: | --------: | ---------: | --------------------------: |
| sveltekit      | Individual disk files        |       110 | 459.6 KiB |   97.1 KiB |                           0 |
| sveltekit      | Disk groups of 64            |       277 | 485.9 KiB |  156.8 KiB |                           0 |
| sveltekit      | Individual virtual + one DTS |       110 | 459.6 KiB |   97.1 KiB |                           0 |
| tanstack-start | Individual disk files        |       101 | 678.2 KiB |  152.6 KiB |                           0 |
| tanstack-start | Disk groups of 64            |       268 | 712.6 KiB |  217.5 KiB |                           0 |
| tanstack-start | Individual virtual + one DTS |       101 | 678.2 KiB |  152.6 KiB |                           0 |

Virtual and individual-disk output are effectively identical in size: TanStack bytes match exactly; SvelteKit differs by a few bytes across runs. Grouped output increases gzip totals by **61.5% for SvelteKit** and **42.5% for TanStack**, and creates more shared client chunks in these fixtures.

## Isolated generation/transport control

These use the same current seven-file transport but an in-memory catalog. SDK loading and framework startup are excluded. “Edit” is compile + transport preparation + file publication, before retransforming the module graph. The dev graph figure is a controlled transform/import crawl, not browser startup. Production bundling here is a tiny single-entry consumer using 10% of the catalog, not the 100-route apps above.

| Approach                     | Generate + prepare + publish | Edit compile + prepare + publish | Dev transform graph | 10% consumer bundle build | 10% gzip |
| ---------------------------- | ---------------------------: | -------------------------------: | ------------------: | ------------------------: | -------: |
| Individual disk files        |                    1877.4 ms |                          90.4 ms |           3139.7 ms |                  403.9 ms |  17321 B |
| Disk groups of 64            |                     106.4 ms |                          72.0 ms |            532.2 ms |                   42.7 ms |  29290 B |
| Individual virtual + one DTS |                     207.2 ms |                          73.9 ms |           2004.6 ms |                  580.0 ms |  17321 B |

The virtual mode makes isolated generation/publication about **9.06× faster**, but the small-consumer bundle build is **43.6% slower**. Its isolated incremental generation/publication is faster, while the integrated SDK/watch-queue update above is slower. These are different timed scopes; the isolated results should not be advertised as application rebuild speedups.

## Interpretation

Virtual individual modules with one DTS solve file count while preserving the individual-module bundle output. They improve cold compilation substantially and give measured whole-pipeline benefits here, but the current prototype does not improve every stage. In particular, integrated incremental compilation needs work before making speed claims or choosing a default. Grouping remains the strongest compilation-speed option in these fixtures, at the cost of larger compressed assets/chunk topology changes and a declaration-export bug that must be fixed before supporting strict library checking.

No peak RAM, editor latency, browser startup/HMR latency, complex real-world message distributions or actual customer application was measured. Mixed-message results in the earlier reports are historical and are not substituted for the current plain-message fixture.

## Reproduce

Build the package first and install the existing framework example dependencies. Use Node 24, the catalog SDK required by the parent PR, and run timings sequentially:

```sh
node prototypes/message-delivery/run.mjs --sizes=20000 --rounds=3 --variants=disk-message,disk-group-64,virtual-message-single-types --output=/tmp/paraglide-current-micro.json
node prototypes/message-delivery/check-types.mjs /tmp/paraglide-current-typechecks.json --large-only
node prototypes/message-delivery/production-benchmark.mjs --count=20000 --routes=100 --rounds=3 --output=/tmp/paraglide-current-production.json
```

The new application generator passed a 200-message/10-route smoke run first. Benchmark subprocesses must succeed; post-build checks require used messages to be present and unused message IDs to be removed for individual modes. All framework application checks passed; grouped strict declaration-check failures are retained explicitly in the type-check report.

Raw observations: [generation/graph](./results/current-micro.json), [TypeScript](./results/current-types.json), [integrated compiler and applications](./results/current-production.json).
