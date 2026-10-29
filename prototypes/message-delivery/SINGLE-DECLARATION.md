# Individual virtual messages with one messages.d.ts

The design works: JavaScript message implementations stay independent and virtual, while one real `messages.d.ts` provides all message types through the public `messages.js` entry point. Per-message declaration files are unnecessary for that API.

The current prototype emits seven files regardless of catalog size. The `messages.js` facade is now virtual too, and needs no TypeScript suppression comments:

```text
                  messages.d.ts
runtime.js        runtime.d.ts
server.js         server.d.ts
registry.js       registry.d.ts
```

Application imports of `./paraglide/messages.js` resolve through Vite to the virtual facade, which re-exports explicit `virtual:paraglide/...` message modules. TypeScript resolves the same application imports to the real `messages.d.ts`. Runtime, registry functions, and server code remain normal files. There is no declaration barrel, declaration shard directory, or unused messages/package.json in this variant.

## What was checked

- Named imports, the `m` namespace, and named/namespaced input types.
- Quoted exports, reserved-word IDs, and a message named `m` (accessible as `m.m`).
- Markup methods, required inputs, configured locale unions, and rejected invalid calls.
- Removing old grouped declaration files when switching to the single declaration layout.
- Vite builds and SSR execution of virtual messages. Runtime behavior, unused-message elimination, and production bundle sizes match individual virtual messages with packed declarations in the paired runs.
- Strict consumers with `allowJs: false`, both `skipLibCheck` settings, and 6,400/20,000 messages.
- No TypeScript suppression comments. Application TS/JS checks pass with `checkJs`, NodeNext/Bundler resolution, strict checking, and consumer-only file lists without ambient declarations or tsconfig changes.

The prototype packs declarations already generated in memory. A production implementation should emit this structure directly from metadata. It does not add a production TypeScript dependency or change the shipped output/default.

## Tradeoffs found

The single declaration file removes nearly all generated disk files without grouping JavaScript or changing its bundle output. It still leaves roughly one Vite module per message. Reducing declaration files does not reduce that JavaScript graph.

It is also not free for the type checker. On the 20,000-message plain fixture, fresh TypeScript 5.9.2 CLI checks took about **3.7 seconds with the single declaration versus 1.3 seconds with declarations grouped by 64**, with `skipLibCheck: false`. With `skipLibCheck: true`, the corresponding medians were **3.0 seconds versus 0.7 seconds**. These include compiler/process startup and are not editor latency measurements.

These results measure this representation, not an inherent lower bound for a single-file design. The prototype preserves both root exports and namespace type exports using explicit value properties and local type aliases. More compact declaration layouts or a direct metadata emitter may change the costs. The initial self-module-import representation was slower and was replaced before the recorded follow-up runs.

Individual message deep imports remain unsupported in the packed/single-declaration modes. The public `messages.js` entry point works without extra declaration files. Production watcher, cache, editor navigation/completion, and actual browser behavior still need validation as described in the README.

## Measurements

The observations below precede virtualization of the facade: the measured single-declaration tree had eight files. The current seven-file transport has passed dev/SSR, type-check, and production-build verification, but this full timing matrix has not been rerun for that revision.

Three rotated repetitions for each paired scenario, with the same compiler and Vite settings as the original prototype. Source-generation/publication measurements exclude SDK loading. Dev graph measurements are in-process transform/crawls, not browser startup. Absolute timings vary between runs, so use the paired observations below rather than mixing them with the earlier matrix.

Raw data: [single-plain.json](./results/single-plain.json), [single-mixed.json](./results/single-mixed.json), and [single-typechecks.json](./results/single-typechecks.json). The type-check experiment runs fresh CLI subprocesses with `strict: true`, `noEmit: true`, `allowJs: false`, and three repetitions per setting.

### 6,400 messages, single-plain

| Variant                      | Disk files | Dev modules | Generate + prepare + write ms | Dev graph crawl ms | Edit compile + prepare + write ms | 10% usage gzip bytes |
| ---------------------------- | ---------: | ----------: | ----------------------------: | -----------------: | --------------------------------: | -------------------: |
| virtual-message-types-64     |        110 |        6404 |                          82.1 |              757.4 |                              16.2 |                 6728 |
| virtual-group-64             |        110 |         104 |                          30.9 |              177.1 |                              20.0 |                11136 |
| virtual-message-single-types |          8 |        6404 |                          72.0 |              698.1 |                              24.4 |                 6728 |

### 20,000 messages, single-plain

| Variant                      | Disk files | Dev modules | Generate + prepare + write ms | Dev graph crawl ms | Edit compile + prepare + write ms | 10% usage gzip bytes |
| ---------------------------- | ---------: | ----------: | ----------------------------: | -----------------: | --------------------------------: | -------------------: |
| virtual-message-types-64     |        323 |       20004 |                         241.2 |             2508.9 |                              49.5 |                17321 |
| virtual-group-64             |        323 |         317 |                         104.0 |              524.9 |                              79.9 |                29290 |
| virtual-message-single-types |          8 |       20004 |                         229.6 |             2327.5 |                              77.9 |                17321 |

### 6,400 messages, single-mixed

| Variant                      | Disk files | Dev modules | Generate + prepare + write ms | Dev graph crawl ms | Edit compile + prepare + write ms | 10% usage gzip bytes |
| ---------------------------- | ---------: | ----------: | ----------------------------: | -----------------: | --------------------------------: | -------------------: |
| virtual-message-types-64     |        110 |        6405 |                          98.9 |             1123.3 |                              17.4 |                19963 |
| virtual-group-64             |        110 |         105 |                          77.9 |              542.4 |                              66.6 |                15799 |
| virtual-message-single-types |          8 |        6405 |                         110.4 |             1106.9 |                              22.7 |                19963 |

### TypeScript CLI checks (milliseconds, including process/compiler startup)

| Messages | Shape | skipLibCheck | Groups of 64 declarations | Single declaration |
| -------: | ----- | ------------ | ------------------------: | -----------------: |
|     6400 | plain | false        |                     651.5 |              918.1 |
|     6400 | plain | true         |                     333.7 |              562.0 |
|     6400 | mixed | false        |                     691.7 |             1019.6 |
|     6400 | mixed | true         |                     336.6 |              678.2 |
|    20000 | plain | false        |                    1271.9 |             3673.2 |
|    20000 | plain | true         |                     696.3 |             2959.2 |
