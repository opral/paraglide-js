# Virtual messages: end-to-end A/B

This fixture compares individual disk message modules with opt-in Vite virtual
messages. Both runs use the same compiler revision, SDK, framework, source
catalog, message-module layout and declarations-enabled options. The only mode
switch is `experimentalVirtualMessages`.

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
  compiler process. The changed disk/virtual leaf and importers are explicitly
  invalidated for both modes before measuring SSR reevaluation. This diagnostic
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
  separate process. Those framework checks use their ordinary `skipLibCheck:
true` setting; strict declaration verification is a separate correctness gate.
- Launch Vite production preview against that completed build and time its first
  complete SSR HTML response separately. This measures preview, not a deployed
  adapter or browser hydration.
- Count physical generated files, total bytes and declaration bytes. Validate
  every production client build removes all 18,000 unused message-ID markers.
  Client gzip is the sum of independently gzipped JavaScript chunks, not initial
  route transfer size. Chunk counts and uncompressed sizes are recorded too.

Raw per-round results and a summary with medians/ranges will be committed here.
Small timing differences across five runs should not be treated as established
improvements. Static namespace import styles and re-export wrappers that retain
the barrel do not receive the direct-import speedup.

## Correctness and review

- Full source suite, strict TypeScript declaration matrix and real browser
  execution of SvelteKit, TanStack Start and React.
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
checks pass with library checking enabled.
