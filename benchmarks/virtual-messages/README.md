# Virtual messages: end-to-end A/B

This fixture compares individual disk message modules with Vite virtual
messages. Both runs use the same compiler revision, SDK, framework, source
catalog, message-module layout and declarations-enabled options. The only mode
switch is `outputStructure: "message-modules"` versus `"virtual-modules"`.
Virtual modules are now the Vite default; the runner selects each mode explicitly.

The implementation keeps physical runtime/server/registry files and the public
`messages.js`, plus a tiny `messages.d.ts` and one combined
`messages.virtual.d.ts`. Safe static `{ m }` and named imports become direct
virtual message imports. Dynamic namespaces retain the barrel.

## Reproduce

Install dependencies and build this checkout, including the SDK required by the
parent v3 cleanup PR. Run with a Node version supported by the installed Vite and
SDK. The recorded run uses Node 24.22.1.

```sh
pnpm build
node benchmarks/virtual-messages/run.mjs --count=20000 --routes=100 --rounds=5 --output=/tmp/paraglide-virtual-ab.json
node benchmarks/virtual-messages/summarize.mjs /tmp/paraglide-virtual-ab.json
```

When using a linked SDK checkout, also pass `--sdk-revision=<commit>` to identify
the SDK code. The JSON records the implementation commit, working-tree status,
contextual parent reference, Node/CPU and actual framework/compiler versions.
The baseline executes this same implementation commit with virtual mode off;
the parent reference is contextual provenance, not another executed binary.

For a quick correctness smoke run:

```sh
node benchmarks/virtual-messages/run.mjs --count=100 --routes=10 --rounds=1 --output=/tmp/paraglide-virtual-ab-smoke.json
```

## Method

- Generated catalog: 20,000 interpolated message IDs, three locales. Both
  generated framework applications contain 100 routes using 2,000 IDs through
  static `{ m }` imports. The initial route uses 20 IDs. These are scale fixtures,
  not a customer's production application.
- Five fresh-process observations per mode and framework, alternating A/B order
  by round. Each observation has a fresh fixture and empty generated/build/Vite
  caches. OS caches and installed package caches remain warm. The SDK importer
  is cached with empty resources before timing; installation/downloads are excluded.
- Isolated compiler diagnostic: time compiler `buildStart`, compiler plus bare
  Vite initialization, and first `ssrLoadModule` for a one-message entry. Package
  imports precede this diagnostic timer. It disables dependency discovery and
  filesystem watching.
- Compiler updates: five source writes/manual watch-queue calls per fresh
  compiler process. The SSR reevaluation timer includes explicit invalidation
  of the changed disk/virtual leaf and importers for both modes. This diagnostic
  does not measure OS watcher or browser-HMR latency.
- Real development HTTP: launch the framework's Vite CLI, wait only for its
  printed listening URL, then issue the first application request and consume
  complete HTML. Report process launch → HTML and readiness → HTML separately.
  Confirm HTTP 200 and the rendered translation. No HTTP readiness probe warms
  the route. Then measure three warm requests and three real watched resource
  edits per process.
- Watched-edit HTTP: source write → first successful response containing the
  updated translation. Poll requests serially with a 50 ms interval; this
  includes watcher delivery, compilation, SSR, active request load and detection
  granularity. It is not isolated compiler or browser-HMR time.
- Reset resources, output, framework, Vite and Paraglide cache state before each
  fresh production build, then run the normal application type checker in a
  separate process. Those framework checks use their ordinary
  `skipLibCheck: true` setting; strict declaration verification is a separate
  correctness gate.
- Launch Vite production preview against that completed build and time its first
  complete SSR HTML response separately. This measures preview, not a deployed
  adapter or browser hydration.
- Count physical generated files, total bytes and declaration bytes. Validate
  every production client build removes all 18,000 unused message-ID markers.
  Client gzip is the sum of independently gzipped JavaScript chunks, not initial
  route transfer size. Chunk counts and uncompressed sizes are recorded too.

Small timing differences across five runs should not be treated as established
improvements. `import * as m` and re-export wrappers that retain the barrel do
not receive the direct-import speedup; static members of `{ m }` are optimized.

## Recorded results

[Raw observations](results/ab.json) and [all medians, ranges and sample counts](results/summary.json)
are committed alongside the runner. These measurements used clean source commit
`eb5dc1d2a215eb02ab0d0ae70cc64234a40879c1` and linked catalog SDK commit
`9b1296dfe35d4ddb832e5a087c98c66ba9a8bcb7`. The linked SDK still reports package
version 4.0.4; that is not the published 4.0.4 implementation. The parent/base
reference is `84a283dc258f96e3f39389e32cf2e42aa08375c6`.

The recorded source used the earlier experimental boolean. The public API now
selects `outputStructure: "virtual-modules"` and defaults to it in Vite. The raw
results retain their original source/API provenance; their timing has not been
relabelled as a fresh measurement of this API/default change. The runner above
uses the current output-structure API.

Hardware: Apple M5 Pro; Node 24.22.1; Vite 8.1.4. SvelteKit 2.69.2 / Svelte 5.56.4
uses TypeScript 5.8.3 and svelte-check 4.3.5. TanStack Start 1.168.27 / React 19.2.3
uses TypeScript 5.9.3. The package compiler uses TypeScript 5.9.2.

All times below are seconds, median [minimum–maximum]. Startup/build/check rows
have five independent process samples per mode. Edits and warm requests have
15 samples across those five processes; compiler updates have 25. Repeated edits
are correlated within their parent process, not 15/25 independent experiments.
The reduction column compares the medians; it is not a confidence interval.

### Compiler and one-message SSR diagnostic

| Metric | Disk median [min–max] | Virtual median [min–max] | Less time |
| --- | ---: | ---: | ---: |
| SDK load + compile + publish | 2.234 [2.182–2.298] | 0.596 [0.553–0.618] | 73.3% |
| Compiler + bare Vite initialization | 2.244 [2.192–2.307] | 0.605 [0.563–0.628] | 73.0% |
| First SSR module graph after initialization | 9.661 [9.512–9.752] | 0.022 [0.021–0.029] | 99.8% |
| Initialization + first SSR graph | 11.901 [11.756–12.011] | 0.627 [0.584–0.657] | 94.7% |
| Resource write + manual compiler queue | 0.297 [0.266–0.374] | 0.277 [0.254–0.330] | 6.8% |
| Explicitly invalidated SSR reevaluation | 1.436 [1.355–2.528] | 0.002 [0.001–0.006] | 99.9% |
| Queue + SSR reevaluation | 1.728 [1.651–2.880] | 0.279 [0.255–0.332] | 83.9% |

The first graph contains 20,004 modules with disk output and three with virtual
output. Peak process RSS through initialization and five edits has a median of
3,003,056 KiB versus 1,367,920 KiB (ranges 2,597,936–3,045,296 and
1,028,224–1,400,176 KiB). This is whole-process peak memory, not isolated compiler
memory. Package imports happen before this diagnostic's initialization timer.

### SvelteKit

| Metric | Disk median [min–max] | Virtual median [min–max] | Less time |
| --- | ---: | ---: | ---: |
| Dev process launch → first complete SSR HTML | 16.012 [15.893–16.931] | 1.121 [1.103–1.131] | 93.0% |
| Dev listening URL → first complete SSR HTML | 11.823 [11.730–12.857] | 0.221 [0.219–0.222] | 98.1% |
| Watched edit → updated SSR HTML | 1.241 [1.090–2.488] | 0.381 [0.360–0.478] | 69.3% |
| Warm development request | 0.037 [0.036–0.042] | 0.002 [0.002–0.004] | 94.8% |

| Metric | Disk median [min–max] | Virtual median [min–max] | Less time |
| --- | ---: | ---: | ---: |
| Production build | 5.060 [4.969–5.174] | 2.640 [2.606–3.079] | 47.8% |
| Application type check | 4.949 [4.788–5.068] | 3.833 [3.814–3.862] | 22.5% |
| Build + check in the same observation | 10.003 [9.867–10.143] | 6.502 [6.439–6.903] | 35.0% |
| Production preview launch → first SSR HTML | 0.255 [0.253–0.258] | 0.251 [0.247–0.259] | — |
| Warm production preview request | 0.002 [0.001–0.004] | 0.001 [0.001–0.002] | — |

### TanStack Start

| Metric | Disk median [min–max] | Virtual median [min–max] | Less time |
| --- | ---: | ---: | ---: |
| Dev process launch → first complete SSR HTML | 19.342 [19.276–20.101] | 1.339 [1.324–1.363] | 93.1% |
| Dev listening URL → first complete SSR HTML | 14.909 [14.807–15.464] | 0.471 [0.465–0.498] | 96.8% |
| Watched edit → updated SSR HTML | 1.748 [1.442–3.318] | 0.410 [0.374–0.510] | 76.6% |
| Warm development request | 0.007 [0.006–0.009] | 0.007 [0.006–0.008] | 2.8% |

| Metric | Disk median [min–max] | Virtual median [min–max] | Less time |
| --- | ---: | ---: | ---: |
| Production build | 5.196 [5.135–5.271] | 1.819 [1.798–1.940] | 65.0% |
| Application type check | 5.002 [4.930–5.207] | 4.158 [4.045–4.213] | 16.9% |
| Build + check in the same observation | 10.241 [10.065–10.389] | 6.032 [5.843–6.099] | 41.1% |
| Production preview launch → first SSR HTML | 0.354 [0.351–0.357] | 0.348 [0.344–0.444] | — |
| Warm production preview request | 0.002 [0.001–0.003] | 0.002 [0.001–0.003] | — |

Production preview startup ranges overlap. These results support improvements to
development startup, compilation, builds and checking; they do not establish a
production request/runtime speedup. Production warm requests are too short and
variable to make a performance claim.

### Output and tree shaking

The following sizes come from the reset catalog used in framework builds; the
compiler-edit diagnostic differs by a few bytes because it records edited text.
MB here means decimal megabytes.

| Metric | Disk | Virtual |
| --- | ---: | ---: |
| Physical output files | 40,011 | 9 |
| Physical output bytes | 30,351,935 | 7,214,414 |
| Declaration bytes | 9,210,510 | 7,101,809 |
| SvelteKit client JS chunks | 110 | 110 |
| SvelteKit total client JS bytes, median | 470,592 | 470,592 |
| SvelteKit summed per-chunk gzip bytes, median | 99,451 | 99,461 |
| TanStack client JS chunks | 101 | 101 |
| TanStack total client JS bytes | 694,485 | 694,485 |
| TanStack summed per-chunk gzip bytes | 156,281 | 156,115 |
| Retained unused message IDs, every build | 0 of 18,000 | 0 of 18,000 |

The unused-message assertions and equal chunk counts show no tree-shaking
regression in these fixtures. The small gzip changes reflect generated chunk
contents/identifiers and do not support a meaningful bundle-size improvement.
All 60 watched-edit observations returned updated content without transient HTTP
errors (two frameworks × two modes × five processes × three edits).

## Correctness and review

- Source suite: 1,112 passed, five skipped across 72 files; package build and
  TypeScript check passed. Strict declaration matrix covers 36 configurations.
  Real browser execution covers SvelteKit, TanStack Start and React.
- Vite 5/6/7/8 dev SSR, production build, disk-output migration and tree shaking.
- Failed-resource recovery, edits/additions/removals, multiple output instances,
  watched config validation, namespace/dynamic/mutation/eval fallbacks, source
  maps, Unicode, directives and dependency evaluation order.
- Independent sub-agent implementation reviews and benchmark-methodology review.
  Findings addressed include grouped-output validation, direct eval, the
  export-star behavior of a message named `default`, and preservation of import
  evaluation order. The latter has a regression using the actual generated
  runtime, rather than only a text assertion.

Browser and Vite-major compatibility records are in `results/frameworks.json`
and `results/vite-versions.json`. Framework whole-project library-check errors
are compared against disk output; scoped application/generated-declaration
checks pass with library checking enabled. SvelteKit whole-project checking with
`skipLibCheck: false` reports 37 dependency diagnostics identical to the disk
control; scoped application/output checking with that setting passes.

## Output-structure API/default follow-up

The API/default update passes 1,120 source tests (five skipped across 73 files),
package build/type checking, and the existing 36-configuration declaration matrix.
Browser checks now exercise the Vite default without an explicit layout setting.
See [framework results](results/frameworks-default-output.json) and
[Vite 5–8 results](results/vite-versions-default-output.json). Current whole-project
SvelteKit library checking has 33 dependency diagnostics identical to physical
output; scoped strict application/declaration checking passes. The historical
records above remain unchanged.

Two blind fresh-context agent usability probes favored explicit invocation
options > project config > defaults. See [scenarios, limitations and applied
decisions](configuration-usability.md). Regression tests cover all layout
overrides, watched config transitions, CLI defaults and Vite-only rejection.
