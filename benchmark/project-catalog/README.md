# Read-only SDK catalog compilation

End-to-end incremental measurements and recovery checks are in [incremental](./incremental/README.md).

Fresh-build measurements using the existing importer are in [round3/no-v2](./round3/no-v2/README.md).
[Round2](./round2/README.md) records the superseded experimental importer.
The measurements below record the initial catalog implementation. The unreleased
API has since been replaced with the stateful `createCatalogLoader()` contract;
recorded results in round directories retain their original source revisions.

Directory compilation uses `@inlang/sdk/catalog.createCatalogLoader()` when that API is
available. The dependency range remains compatible with the published SDK; older
SDK versions use the existing project loader. `compileProject({ project })`
continues to work, and `compileCatalog({ catalog })` exposes the database-free
compiler entry point. Both entry points use the same emitter.

The SDK change is deliberately unreleased. For development, build its SDK package
and link that package into Paraglide's `node_modules/@inlang/sdk`. Do not commit a
machine-specific dependency path or publish the SDK for these measurements.

```sh
# In the inlang checkout
pnpm --filter @inlang/sdk build

# In the Paraglide checkout
pnpm link /absolute/path/to/inlang/packages/sdk
pnpm build
```

Catalog loading does not update project metadata. Paraglide opts into the SDK's
`writePluginCache: true` option so an online compile continues to populate the
remote-plugin cache for subsequent offline builds; the loader remains read-only
by default for other consumers. Unreadable resource files reject before publication,
matching the existing directory compiler's failure behavior. It does not change
the emitted file layout. Warm compilations retain the loader via `previousCompilation`
and apply reset/update batches. The default message layout now regenerates only
changed bundles for edits with unchanged keys; see the incremental results for
full-emitter fallbacks and other layouts.

## Measurements

Local measurements on 2026-10-28, Node 22.21.1 on macOS. Three locales
(en/de/fr), flat keys, one username input per message, message-format plugin
4.5.5. Three serial fresh-process trials per backend/layout/size, alternating
backend order. Every trial calls the public `compile()` API with declarations
and an initially absent output directory. All rendering, hashing and filesystem
writes are included. Module imports are excluded from `totalMs` and reported
separately; Node startup and fixture creation are excluded. The inputs have just
been written, so these are warm filesystem-cache measurements.

| Keys × 3 locales | Layout  | Published SDK 4.0.4 | Linked catalog SDK | Time saved |
| ---------------- | ------- | ------------------: | -----------------: | ---------: |
| 6,400            | Message |            4,505 ms |             913 ms |      79.7% |
| 6,400            | Locale  |            3,955 ms |             471 ms |      88.1% |
| 13,300           | Message |            7,284 ms |           1,704 ms |      76.6% |
| 13,300           | Locale  |            6,428 ms |             937 ms |      85.4% |

The baseline compiler was built at `7a72c0cf95b5f3e527ecfc3350903ba559e4a797`
(its compiler source matches the current main base `239411bb`); the candidate
uses this PR and SDK commit `1102ccee29024d0598f46007cbaddbf7797efce5`
([SDK PR #4501](https://github.com/opral/inlang/pull/4501)). These totals compare
the installed stacks. The SDK PR separately compares both loader APIs from the
same SDK build, reporting settings plus nested bundles ready in 3.20 s → 0.25 s
and 5.96 s → 0.51 s for the two sizes.

Generated JavaScript and declarations match in every paired group. Output hashes
normalize only the README's fixture-specific project path. Round zero evaluates
every message in every locale after timing: 19,200 or 39,900 calls per case.
Integration tests separately cover plurals, context, markup, fallback, unsafe IDs,
compiler options and strict declaration consumers. The benchmark does not measure
incremental builds, cold disk, complete CLI startup, or every plugin/project.

`results.jsonl` contains all 24 full-build trials; `summary.json` contains medians,
output counts and matching hashes. To reproduce, first build both Paraglide
checkouts and link the candidate SDK as above. Then run with absolute paths:

```sh
CATALOG_BENCH_BASELINE=/path/to/baseline/paraglide-js \
CATALOG_BENCH_CANDIDATE=/path/to/candidate/paraglide-js \
CATALOG_BENCH_PLUGIN=/path/to/message-format/dist/index.js \
CATALOG_BENCH_RESULTS=/tmp/fresh-catalog-benchmark \
  node benchmark/project-catalog/run-matrix.mjs
```

Use a fresh results directory. The runner checks the candidate SDK exposes the
catalog API. Compare hashes at each size/layout before interpreting timing
results. Both layouts must emit declarations and all expected runtime outputs.

## Independent CPU review

Four separate diagnostic profiles cover both sizes and layouts. Sampling starts
immediately before public `compile()` and stops before harness output readback,
hashing and runtime validation. These profiles are separate from the unprofiled
medians above. Garbage collection and idle/I/O wait samples are reported
separately; sampling attribution is approximate and not a phase wall-clock timer.

Locale output is now chiefly limited by catalog normalization, validation and
copies (about 178 ms sampled at 6,400 keys), plus allocation/GC. The final
snapshot clone alone samples about 54 ms. The earlier lightweight prototype did
less defensive copying and import validation, so its lower timing is not the
production result.

Message output additionally publishes 12,814 or 26,614 files; file publication and
filesystem waits dominate its remaining time. Direct declaration emission is a
small cost (about 11–35 ms sampled across these profiles). No output sharding,
JSDoc removal or incremental compilation is introduced here.

`profile-summary.json` contains the grouped diagnostic samples. To reproduce a
profile, set `CATALOG_CPU_PROFILE=/tmp/catalog.cpuprofile` with the same environment
variables above and run `run-case.mjs catalog message 6400 900 full`, then:

```sh
node benchmark/project-catalog/analyze-cpu.mjs /tmp/catalog.cpuprofile
```
