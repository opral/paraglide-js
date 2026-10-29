# Message delivery prototype

This is a standalone experiment for the follow-up to Paraglide v3, stacked on #847. It changes no shipped compiler options, bundler plugins, or defaults. It compares the existing grouped emitter with virtual message implementations in Vite. `runtime.js`, `server.js`, `registry.js`, the public `messages.js` facade, and declarations stay on disk.

## Run

Use Node 22.18+ or 24+ and install the repository's dependencies. Build the package first (`npm run build`). The parent PR currently requires the catalog SDK from inlang PR #4503; see #847 for that prerequisite.

```sh
node --test prototypes/message-delivery/verify.mjs
node prototypes/message-delivery/run.mjs --sizes=50 --rounds=1
node prototypes/message-delivery/run.mjs --sizes=1000,6400,20000 --rounds=3 --output=/tmp/plain.json
node prototypes/message-delivery/run.mjs --sizes=1000,6400 --rounds=3 --shape=mixed --output=/tmp/mixed.json
node prototypes/message-delivery/summarize.mjs
node prototypes/message-delivery/check-types.mjs /tmp/single-typechecks.json
node prototypes/message-delivery/summarize.mjs --single
```

`--variants=disk-message,disk-group-64,virtual-group-64` selects a smaller matrix. Each completed case checkpoints results to the requested JSON path. Temporary generated projects are removed after the run. Large runs create tens of thousands of temporary files and take several minutes.

## Variants

| Name                           | JavaScript message modules                           | Declaration files                        |
| ------------------------------ | ---------------------------------------------------- | ---------------------------------------- |
| `disk-message`                 | One per message, on disk                             | One per message                          |
| `disk-group-16/64/256`         | Existing `messageModuleSize` grouped output, on disk | Same grouping                            |
| `disk-locale`                  | Existing `locale-modules` output, on disk            | Existing locale declarations             |
| `virtual-message`              | One virtual module per message                       | One per message, on disk                 |
| `virtual-message-types-64`     | One virtual module per message                       | Pack existing signatures in groups of 64 |
| `virtual-group-64`             | Grouped modules, virtual                             | Groups of 64, on disk                    |
| `virtual-message-single-types` | One virtual module per message                       | One `messages.d.ts` for all messages     |

The ordinary Vite plugin currently chooses `locale-modules` during development and `message-modules` during production. Both baselines matter: virtualizing individual messages can be slower than the existing development default even when it writes fewer files than production's default.

`prototype.mjs` contains a reusable `virtualMessages(outdir, files)` Vite plugin. It resolves relative imports from virtual modules back into the generated directory, keeps trees scoped to their own output directories, and marks generated message implementations as side-effect-free. It uses a `\0` namespace according to [Vite's virtual module convention](https://vite.dev/guide/api-plugin.html#importing-a-virtual-file).

The prototype exposes `plugin.api.update(nextVirtualFiles)`. This invalidates changed modules and their importers, including the re-export barrel, and sends a full reload. Verification covers SSR execution, disk registry imports, added/removed exports, edits, no-op updates, and declaration consumers with quoted exports and markup. The benchmark's build outputs are also executed, and unused-message sentinels are checked.

Declaration packing changes declaration paths only; JavaScript still has independent message modules. It preserves the existing declaration signatures and uses the public `messages.js` facade. Individual message deep imports are intentionally unsupported in this mode. Packing is an experiment, not a proposed supported public API.

## Single declaration follow-up

`virtual-message-single-types` keeps JavaScript messages individual and virtual, with their named declarations directly in the real `messages.d.ts` entry point. It preserves value exports, quoted message IDs, input type exports, the `m` namespace and its input types, markup methods, and locale unions. A message named `m` remains accessible as `m.m`, without inventing a recursive namespace. Runtime type imports are adjusted for the root file.

The physical `messages.js` facade still contains `export * from './messages/_index.js'` and `export * as m from './messages/_index.js'`. Vite intercepts that path and serves the virtual barrel and its individual message modules. During production builds, Vite resolves and bundles those imports into the application output.

TypeScript application imports resolve against the adjacent `messages.d.ts`; it does not need to resolve virtual implementations for those types. If `checkJs` also checks the generated facade itself, its virtual imports otherwise cause TS2307. The single-file variant therefore puts `// @ts-nocheck` on that generated facade only. This does not disable checks in application TS/JS code, whose types still come from the declaration. Verification includes `checkJs: true` across generated/application files, confirms the original missing-module error without the guard, and checks that invalid calls are still rejected after it.

There are eight disk files: `messages.js`, `runtime.js`, `server.js`, `registry.js`, and their four `.d.ts` companions. No `messages/` declaration shards, declaration barrel, or otherwise unused `messages/package.json` are emitted. Switching from packed declarations removes the old files.

This packages the existing direct emitter's declarations. It extracts their fixed non-generic type alias and value export formats to preserve the namespace API. A production emitter should generate this structure directly from metadata instead of building intermediate per-message declarations. It adds no production TypeScript dependency.

See [SINGLE-DECLARATION.md](./SINGLE-DECLARATION.md) for the follow-up results. To reproduce:

```sh
node prototypes/message-delivery/run.mjs --sizes=6400,20000 --rounds=3 --variants=virtual-message-types-64,virtual-message-single-types,virtual-group-64 --output=/tmp/single-plain.json
node prototypes/message-delivery/run.mjs --sizes=6400 --rounds=3 --shape=mixed --variants=virtual-message-types-64,virtual-message-single-types,virtual-group-64 --output=/tmp/single-mixed.json
node prototypes/message-delivery/check-types.mjs /tmp/single-typechecks.json
```

The separate type-check experiment runs fresh TypeScript CLI subprocesses with `strict: true`, `allowJs: false`, and both `skipLibCheck` settings. It validates first/last messages, named and namespaced input types, and rejected calls at 6,400 and 20,000 messages. Timings include process/compiler/library startup, not language-server latency. The original eight-variant graph experiment did not measure type-checking.

## Measurement boundaries

See [RESULTS.md](./RESULTS.md) and the complete JSON observations under `results/`.

- Three locales per catalog; a plain fixture uses interpolation. The mixed fixture cycles interpolation, static messages, markup, and plural selectors. Production consumers statically access one message or the first 10% through `m`.
- Three repetitions in one Node process, rotating scenario order between rounds. The compiler receives an unreported 16-message warmup. Reported values are medians of observed totals, not sums of separate medians.
- “Generate + prepare + write” includes generation, declaration packing/transport partitioning, hashes and real filesystem writes. It excludes SDK loading and input parsing. “Cold” means a fresh output directory and Vite graph, with warm OS caches and compiler JIT.
- “Dev graph crawl” creates a Vite server and recursively calls `transformRequest` for every static dependency with concurrency eight. It includes a TypeScript-parser-based import walk. It excludes server creation, browser network/parse/render time, and dependency optimization. This is a controlled graph benchmark, not a browser startup measurement. Virtual URL decoding reproduces Vite's `/@id/__x00__` transport convention.
- The edit case changes the first English message. It uses the existing incremental compiler, then packs/transports and publishes files. Its table column excludes the subsequent graph crawl. That later crawl deliberately invalidates the entire graph for both transports, so it does not claim to measure selective HMR latency. OS watcher scheduling is excluded; the plugin receives explicit updates.
- `emitTsDeclarations: true` throughout. README and ignore-file generation are disabled. Disk counts include the generated messages/package.json. Virtual counts and generated byte totals are retained in raw results.
- Build comparisons use Vite 8's default minifier, target ES2022, ES-module entry exports preserved, and `write: false`. Gzip uses Node's defaults. One-message bundles execute and return the expected string; 10% bundles return the expected array length.
- Memory, browser requests, language-server responsiveness, declaration-check performance, real application routing/code splitting, middleware locale splitting, per-locale builds, SDK I/O, and production watcher/cache integration are not measured. No universal default should be selected from this experiment alone.

## Production integration still needed

The plugin eagerly receives the generated message strings; it is not a lazy compiler and does not eliminate generation or retained-memory cost. Virtual modules also do not remove Vite module graph nodes.

A production integration must connect virtual output to the existing compiler queue, tracked input watching, error overlay and recovery, config reloads, and Vite client/SSR environments. A fresh process must reconstruct virtual content even when the persistent disk cache would skip compilation. It must also clean obsolete disk implementations when switching transport modes and preserve the tooling paths needed by editors, linters, tests, and non-Vite consumers.

Full reloads are intentional for this prototype. Granular HMR and real browser latency need separate validation. The parent release PR remains separate; this branch does not change the v3 default.
