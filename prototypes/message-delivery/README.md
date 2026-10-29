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
```

`--variants=disk-message,disk-group-64,virtual-group-64` selects a smaller matrix. Each completed case checkpoints results to the requested JSON path. Temporary generated projects are removed after the run. Large runs create tens of thousands of temporary files and take several minutes.

## Variants

| Name                       | JavaScript message modules                           | Declaration files                        |
| -------------------------- | ---------------------------------------------------- | ---------------------------------------- |
| `disk-message`             | One per message, on disk                             | One per message                          |
| `disk-group-16/64/256`     | Existing `messageModuleSize` grouped output, on disk | Same grouping                            |
| `disk-locale`              | Existing `locale-modules` output, on disk            | Existing locale declarations             |
| `virtual-message`          | One virtual module per message                       | One per message, on disk                 |
| `virtual-message-types-64` | One virtual module per message                       | Pack existing signatures in groups of 64 |
| `virtual-group-64`         | Grouped modules, virtual                             | Groups of 64, on disk                    |

The ordinary Vite plugin currently chooses `locale-modules` during development and `message-modules` during production. Both baselines matter: virtualizing individual messages can be slower than the existing development default even when it writes fewer files than production's default.

`prototype.mjs` contains a reusable `virtualMessages(outdir, files)` Vite plugin. It resolves relative imports from virtual modules back into the generated directory, keeps trees scoped to their own output directories, and marks generated message implementations as side-effect-free. It uses a `\0` namespace according to [Vite's virtual module convention](https://vite.dev/guide/api-plugin.html#importing-a-virtual-file).

The prototype exposes `plugin.api.update(nextVirtualFiles)`. This invalidates changed modules and their importers, including the re-export barrel, and sends a full reload. Verification covers SSR execution, disk registry imports, added/removed exports, edits, no-op updates, and declaration consumers with quoted exports and markup. The benchmark's build outputs are also executed, and unused-message sentinels are checked.

Declaration packing changes declaration paths only; JavaScript still has independent message modules. It preserves the existing declaration signatures and uses the public `messages.js` facade. Individual message deep imports are intentionally unsupported in this mode. Packing is an experiment, not a proposed supported public API.

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
