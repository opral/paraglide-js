# Message delivery prototype

This is an experiment for the follow-up to Paraglide v3, stacked on #847. It includes an opt-in Vite integration; existing defaults are unchanged. It compares the existing grouped emitter with virtual message implementations in Vite. `runtime.js`, `server.js`, `registry.js`, and declarations stay on disk. Most variants also keep the public `messages.js` facade on disk; the single-declaration variant virtualizes it too.

## Current integrated measurements

See [CURRENT-BENCHMARKS.md](./CURRENT-BENCHMARKS.md) for fresh measurements of the integrated seven-file transport: 20,000 messages, real SDK/watch-queue updates, declaration checks, and 100-route SvelteKit/TanStack production build-and-check pipelines. It includes the raw observations, timing boundaries, grouped-output declaration failure, and reproduction commands. Earlier tables below remain historical comparisons with different scopes.

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

`prototype.mjs` reuses the `virtualMessages(outdir, files)` transport from the Vite integration. It resolves relative imports from virtual modules back into the generated directory, keeps trees scoped to their own output directories, and marks generated message implementations as side-effect-free. It uses a `\0` namespace according to [Vite's virtual module convention](https://vite.dev/guide/api-plugin.html#importing-a-virtual-file).

The prototype exposes `plugin.api.update(nextVirtualFiles)`. This invalidates changed modules and their importers, including the re-export barrel, and sends a full reload. Verification covers SSR execution, disk registry imports, added/removed exports, edits, no-op updates, and declaration consumers with quoted exports and markup. The benchmark's build outputs are also executed, and unused-message sentinels are checked.

Declaration packing changes declaration paths only; JavaScript still has independent message modules. It preserves the existing declaration signatures and uses the public `messages.js` facade. Individual message deep imports are intentionally unsupported in this mode. Packing is an experiment, not a proposed supported public API.

## Single declaration follow-up

`virtual-message-single-types` keeps JavaScript messages individual and virtual, with their named declarations directly in the real `messages.d.ts` entry point. It preserves value exports, quoted message IDs, input type exports, the `m` namespace and its input types, markup methods, and locale unions. A message named `m` remains accessible as `m.m`, without inventing a recursive namespace. Runtime type imports are adjusted for the root file.

The `messages.js` facade is now virtual too. Application imports stay `./paraglide/messages.js`; Vite resolves that path to an internal `\0virtual:paraglide/<output-id>/messages.js` ID. Its in-memory source re-exports an explicit `virtual:paraglide/<output-id>/messages/_index.js` barrel. Individual message modules remain virtual, and runtime/server/registry code remains on disk.

TypeScript resolves the application's `.js` import to the real `messages.d.ts` using ordinary extension substitution. No physical facade contains unresolved virtual imports for `checkJs` to flag. There are no TypeScript suppression comments, ambient-module setup, or tsconfig edits. Verification covers 36 configurations: Node16, NodeNext and Bundler resolution; `allowJs: false`, `allowJs: true` with `checkJs: false` or `true`; both `skipLibCheck` settings; and consumer-only or whole-output inclusion. Strictness also includes `isolatedModules`, `verbatimModuleSyntax`, `noUncheckedSideEffectImports`, `noUncheckedIndexedAccess`, and `exactOptionalPropertyTypes`.

With optional README/ignore files disabled, the current tree has seven disk files: `runtime.js`, `server.js`, `registry.js`, their three declaration companions, and `messages.d.ts`. Switching from packed declarations or an older physical facade removes obsolete files. The eight-file counts in the recorded single-declaration matrix precede this facade change; those observations remain historical data, not a measurement of the updated transport.

Vite's documented convention is a `virtual:` public ID plus a `\0` resolved ID. Community plugins such as vite-plugin-pwa also provide ambient `declare module` types for applications importing virtual IDs directly. Here the application keeps a normal relative entry-point import and a real declaration file, so it needs no ambient registration. A `virtual:` prefix alone would not make TypeScript resolve a physical facade's import.

Sources: [Vite virtual modules](https://vite.dev/guide/api-plugin.html#importing-a-virtual-file), [TypeScript module resolution](https://www.typescriptlang.org/docs/handbook/modules/reference.html#file-extension-substitution), [vite-plugin-pwa declarations](https://github.com/vite-pwa/vite-plugin-pwa/blob/main/vanillajs.d.ts).

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
- The historical timing matrix does not measure memory, browser startup, language-server responsiveness, real application routing/code splitting, middleware locale splitting, per-locale builds, or SDK I/O. The follow-up below tests real applications and watcher/cache correctness without assigning timing measurements to them. No universal default should be selected from this experiment alone.

## Integrated Vite prototype

Enable it only on the Vite plugin:

```ts
paraglideVitePlugin({
	project: "./project.inlang",
	experimentalVirtualMessages: true,
});
```

This selects message modules and declarations within this opt-in mode. It rejects explicit `emitTsDeclarations: false`, locale-module output, and the per-locale-build experiment. Ordinary compiler/CLI behavior and global defaults remain unchanged. Application imports keep their existing paths, including SvelteKit `$lib` aliases and TanStack `@/` paths. Vite's native TypeScript path resolver requires a real target; the integration resolves the real declaration through Vite and maps its identity to the virtual JavaScript implementation.

The compiler's existing serial queue, tracked input watcher, config resolution and error handling publish the physical output first, then update the virtual graph. Failed compilation/publication leaves the last successful implementations available. New plugin instances have isolated compilation state and bypass disk-only persistent cache restoration, because disk hashes cannot reconstruct virtual strings. Switching from disk output removes the old message implementations and declaration leaves. Changes invalidate imports and trigger full reloads.

Reproduce the verification after building the package:

```sh
node --test prototypes/message-delivery/verify.mjs
node prototypes/message-delivery/framework-e2e.mjs
node prototypes/message-delivery/vite-versions.mjs
node node_modules/vitest/vitest.mjs run --dir src
```

The framework runner copies repository examples into temporary directories and uses their installed dependencies, real Vite dev/preview processes, and headless Playwright Chromium. It needs Playwright and a browser installed in the workspace dependency store. The Vite-version runner needs Vite 5/6/7/8 installed in that store. The TanStack fixture adapts the example's legacy `.validator` call to `.inputValidator` and removes an unused import only in the temporary copy. No example files are modified.

See [INTEGRATION.md](./INTEGRATION.md) and [results/integration.json](./results/integration.json) for the tested versions and results. This remains experimental: implementations are eagerly generated and retained in memory; the single declaration is assembled from the direct emitter's fixed output format; deep message imports have no declaration leaves; and direct Node/non-Vite execution of message imports is unsupported. Full reloads are intentional. The parent release PR remains separate.
