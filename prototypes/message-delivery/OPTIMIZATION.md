# Optimizing virtual messages without enlarging bundles

The recommended prototype rewrites safe static message accesses to direct individual virtual imports, and shares one in-flight export-index build between parallel transforms. It preserves the seven-file output and one messages.d.ts. Application source/imports and the emitted declarations are unchanged. It is isolated under prototypes; the public Vite option and release defaults are unchanged.

## What the profile showed

The baseline loads the facade and a barrel re-exporting every message. An entry reading one message loaded **20,004 modules**, including 20,002 virtual facade/barrel/message modules. In a separate V8 SSR profile, the largest named sampled hotspot was Vite's `runInlinedModule` (~1.75s sampled self-time), followed by substantial parsing, source-map work, GC and VM/native attribution. Eliminating module creation/evaluation is more useful than optimizing string lookup in resolveId.

A build-hook profile confirmed that both framework client and SSR environments load **20,002 virtual modules per pass** in the baseline. The direct-import prototype loads only the **2,000 used messages per pass** in the 100-route fixtures; no facade or full message barrel needs loading for those static consumers.

The first transform had its own concurrency defect: parallel routes independently read and parsed the same declaration before the index was ready. An instrumented SvelteKit build counted **102 index builds for SSR and 101 for client**. A shared promise reduces that to **one per environment**. A paired ablation (three runs) reduced SvelteKit build time from **4.37s to 2.91s** and TanStack from **2.56s to 1.96s**, versus the first direct-import implementation.

Profiles also identify remaining work: SvelteKit recompiles the catalog in its second environment (~0.5s), while TanStack's second compiler hook reuses state (~3ms). The application type-check stage remains around four seconds. Neither of those is solved by the import transform.

## How it works

A post-transform plugin verifies that an import resolves to this output directory's own Paraglide facade. It parses the transformed JS, identifies safe reads of the imported namespace, and rewrites them to leaf imports. For example, the application's `import {m} from './paraglide/messages.js'; m.hello()` becomes an in-memory import of `hello` from `virtual:paraglide/<scope>/messages/hello.js`, followed by a call to that binding.

Named imports/aliases and quoted static keys are supported. Dynamic keys, namespace enumeration/escape, unknown keys, namespace mutation, optional namespace access and ambiguous shadowing retain the existing barrel. That fallback preserves behavior and accepts that such consumers may need the whole catalog. The prototype does not create a lazy proxy or hide message references from the bundler.

The TypeScript/editor entry remains the real messages.d.ts. The transform runs on JS after framework compilation and returns a composed source map. It adds no TypeScript suppression comments, ambient registration, application tsconfig changes, per-message declaration leaves or extra output files.

## Final matched measurements

Same scale and timing boundaries as [CURRENT-BENCHMARKS.md](./CURRENT-BENCHMARKS.md): Apple M5 Pro, Node 24.22.1, Vite 8.1.4, 20,000 interpolated message IDs, three locales, 100 routes using 2,000 messages. Three unprofiled repetitions for each final scenario; framework order rotates. OS/importer caches are warm, processes and output directories fresh. Separate profiling runs are excluded from these medians.

The SSR benchmark entry reads **one message**. These are module-loading/evaluation timings after compilation, not HTTP/page load measurements. The combined row includes compiler/Vite initialization plus that module load, but not Node/package import startup. The edit row includes the real SDK/compiler queue and subsequent SSR reevaluation, excluding OS watcher delivery and browser hydration. Fifteen edits per scenario were observed.

| Measurement                        | Current virtual baseline | Static imports + shared index |
| ---------------------------------- | -----------------------: | ----------------------------: |
| SSR modules loaded                 |                   20,004 |                             3 |
| Compiler + Vite initialization     |                 568.6 ms |                      619.1 ms |
| First SSR module load              |               6,448.1 ms |                       48.9 ms |
| Compiler + first SSR module load   |               7,016.7 ms |                      663.2 ms |
| One-message compiler queue update  |                 315.3 ms |                      298.6 ms |
| SSR reevaluation after edit        |               1,217.3 ms |                        7.9 ms |
| Compiler update + SSR reevaluation |               1,529.3 ms |                      306.1 ms |

The matched first SSR module load is **132× faster**. Including compiler initialization it is **10.6× faster**. The matched compiler-update-plus-SSR-refresh is **5.0× faster**; compiler queue time itself is roughly unchanged. This does not claim 132× faster full application startup or browser HMR.

| Framework      | Stage             | Current virtual baseline | Static imports + shared index |
| -------------- | ----------------- | -----------------------: | ----------------------------: |
| sveltekit      | vite build        |                   5.47 s |                        2.94 s |
| sveltekit      | Application check |                   4.09 s |                        3.97 s |
| sveltekit      | Build + check     |                   9.56 s |                        7.02 s |
| tanstack-start | vite build        |                   3.31 s |                        2.06 s |
| tanstack-start | Application check |                   4.20 s |                        4.18 s |
| tanstack-start | Build + check     |                   7.48 s |                        6.24 s |

Build time falls **46.2% in SvelteKit** and **37.8% in TanStack Start**. Build plus application checking falls **26.6% / 16.6%**. Declaration/source types did not change; type-check differences are small and should not be attributed to the runtime import transform. Each column is a separate median, so stages need not add to the median of their measured combined pipeline.

## Tree shaking and emitted client output

All 18,000 unused message IDs are absent from emitted client chunks. Runtime execution checks compare optimized and baseline values, including markup/registry cases. Client chunk counts are unchanged; JavaScript sizes match except tiny output-name/minifier ordering differences. Gzip totals sum all client JS chunks individually, not initial-page transfer.

| Framework      | Approach                      | JS chunks | JS bytes | Gzip bytes | Retained unused message IDs |
| -------------- | ----------------------------- | --------: | -------: | ---------: | --------------------------: |
| sveltekit      | Current virtual baseline      |       110 |   470588 |      99449 |                           0 |
| sveltekit      | Static imports + shared index |       110 |   470588 |      99459 |                           0 |
| tanstack-start | Current virtual baseline      |       101 |   694485 |     156281 |                           0 |
| tanstack-start | Static imports + shared index |       101 |   694485 |     156115 |                           0 |

SvelteKit's gzip difference is ten bytes (~0.01%); TanStack is 166 bytes smaller (~0.1%). No meaningful size regression was observed in these fixtures. This is evidence for the tested cases, not proof for every application/message distribution.

## Other prototypes

- **Synchronous virtual-ID fast path:** keeps 20,004 SSR modules. Separate profiling passes took 7.45s baseline and 7.22s with this shortcut; the small single-run difference is not conclusive. It does not fix the graph-size problem and was not selected.
- **Raw virtual fusion, 64 messages per module:** combines unchanged individual bodies in pure closures, rather than using the earlier grouped emitter's shared dispatcher. Its first SSR load improved from 6.58s to 2.70s in its paired batch, with 317 modules. All unused IDs were still removed, but client gzip grew by **38.4% in SvelteKit** and **28.1% in TanStack**, and client chunk counts grew to 277/268. Edits also force regeneration/reload of the fused graph. This misses the output-preservation goal and was not selected.
- **Direct imports without an in-flight index:** confirms the graph optimization, but repeated declaration parsing limits build gains. It is retained as the control for the profile-driven shared-index change.

The final timing table comes from a fresh baseline-versus-winner batch. The broader prototype comparison and the isolated index ablation are separate paired batches; their absolute timings should not be mixed to compute speedups.

## Verification and limitations

- Thirteen focused tests pass: aliases, quoted/reserved IDs, a message named m, parts/markup, registry/plural functions, unknown/dynamic keys, namespace enumeration and escape, mutations, shadowing, unrelated imports, source maps, additions/removals and updates, runtime bundle equivalence, unused-message elimination and shared indexing of parallel consumers.
- Actual Chromium dev/production checks pass in SvelteKit, TanStack Start and React, with SSR/hydration where applicable, SvelteKit locale changes/watched edits and TanStack client navigation. Application type checks pass. The existing SvelteKit whole-project skipLibCheck=false dependency issue remains the same for the disk control; scoped application/generated declaration checking passes.
- The optimized path also passes dev SSR, production bundling, tree shaking and disk-output migration on Vite 5.4.21, 6.4.1, 7.3.1 and 8.1.4. See [compatibility results](./results/optimization-compatibility.json).
- The prototype targets one individual-message output root (messageModuleSize=1). It is conservative: an ambiguous use falls back to the whole namespace, which can lose the speedup without changing that consumer's semantics.
- The experimental helper uses the repository's dev-only TypeScript AST parser and a MagicString source map. These are prototype tools; no TypeScript production dependency was added. A production implementation should use an appropriately scoped parser/bundler integration, compiler export metadata instead of scanning declarations, and integrate input/config invalidation and multiple output instances. No default or public compiler option changed in this experiment.
- Peak RAM, editor latency, cold installs, initial HTTP/page latency and browser HMR latency are not measured. The main build fixture has plain interpolation; mixed features have focused correctness/bundle tests, not a new large-catalog timing matrix.

## Profiles and reproduction

[profiles/summary.json](./profiles/summary.json) contains hook counts, index-read counts and top sampled frames. Raw V8 captures are gzip-compressed under [profiles](./profiles). Machine-local paths are sanitized; stack labels/line numbers and sampling data are retained. V8 main-thread profiles do not fully attribute native Rolldown worker CPU. Profiled wall times are diagnostic only; published medians use unprofiled processes.

Use the same dependencies as the existing benchmark, build the package first, and run workloads sequentially:

```sh
node --test prototypes/message-delivery/optimization.test.mjs
node prototypes/message-delivery/production-benchmark.mjs --count=20000 --routes=100 --rounds=3 --scenarios=virtual-single,virtual-direct-indexed --output=/tmp/optimization-final.json
node prototypes/message-delivery/framework-e2e.mjs --optimization=direct-indexed
node prototypes/message-delivery/vite-versions.mjs --optimization=direct-indexed
```

For exploratory controls, select `virtual-direct`, `virtual-fused-64` or `virtual-sync-resolve`. `--skip-compiler` runs only the framework build/check portion for an index-concurrency ablation. The harness retains generated fixture directories and records their path in the local output metadata. Against one of those compiler fixtures, capture a scoped SSR profile with:

```sh
node prototypes/message-delivery/profile-ssr.mjs /path/to/compiler-virtual-single baseline /tmp/ssr-profiles
node prototypes/message-delivery/profile-ssr.mjs /path/to/compiler-virtual-single direct-indexed /tmp/ssr-profiles
node prototypes/message-delivery/profile-build.mjs /path/to/sveltekit-virtual-direct-indexed sveltekit-indexed /tmp/build-profiles
```

The build profiler temporarily instruments the retained fixture's config and restores it afterward. To inspect a committed capture, first decompress it, for example:

```sh
gzip -dc prototypes/message-delivery/profiles/ssr-baseline.cpuprofile.gz > /tmp/ssr-baseline.cpuprofile
```

Raw observations: [broad prototypes](./results/optimization-experiments.json), [index ablation](./results/optimization-index-ablation.json), [final matched run](./results/optimization-final.json), [browser/framework checks](./results/optimization-e2e.json).
