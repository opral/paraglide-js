# Cold compile follow-up benchmark

> Historical pre-removal results: the fastest updated-plugin cases below used the
> experimental string-only V2 importer, which has been removed. Current results
> using the existing `importFiles()` API are in [round3/no-v2](../round3/no-v2/README.md).
> Keep the recorded timings and provenance below as historical evidence only.


This harness measures the frozen and candidate Paraglide stacks, an explicitly
selected candidate message-format plugin, and Grai. It generates fresh synthetic
projects and output directories for every trial. Incremental compilation and
existing output caches are outside the comparison.

Production results, raw data, and artifact provenance are recorded below. Build and
freeze all selected compiler, SDK and plugin artifacts before reproducing a run.

## Configuration

Use Node 22 and absolute paths. The baseline and candidate are built Paraglide
checkout/package directories containing `dist` and their own installed SDK.
`CATALOG_BENCH_PLUGIN` is the **frozen** bundled message-format plugin entry file.
`CATALOG_BENCH_GRAI` accepts either a built Grai checkout or its `dist/compile.js`.
The results directory must be new for each matrix.

```sh
export CATALOG_BENCH_BASELINE=/absolute/frozen/paraglide-js
export CATALOG_BENCH_CANDIDATE=/absolute/candidate/paraglide-js
export CATALOG_BENCH_PLUGIN=/absolute/frozen/message-format/dist/index.js
export CATALOG_BENCH_GRAI=/absolute/grai/dist/compile.js
export CATALOG_BENCH_RESULTS=/tmp/catalog-round2-full

# Optional: opt into separately labeled candidate importer measurements.
export CATALOG_BENCH_OPTIMIZED_PLUGIN=/absolute/candidate/message-format/dist/index.js

node benchmark/project-catalog/round2/run-matrix.mjs full
```

The plugin is copied into each fixture. The `sdk` backend always uses the baseline
checkout and frozen plugin. `catalog` always uses the candidate checkout and
frozen plugin. `catalog-optimized` always uses the candidate checkout and the
explicit optimized plugin; invoking that backend without its environment variable
fails. Candidate backends require the linked SDK's compiled catalog entry file,
preventing accidental measurement of the legacy fallback. The baseline label
identifies the frozen stack; it does not imply a particular SDK version or loader
when that stack itself contains the catalog API.

By default, three serial fresh child processes run per size/backend/layout group;
the recorded production runs use five via `CATALOG_BENCH_ROUNDS=5`, with
case order rotated each round. Sizes are 6,400 and 13,300 keys across en/de/fr;
every translation has one username input. The layouts are `default` (one message
per module), `locale`, and `shards` (512 messages per module). The baseline predates
sharding and runs default/locale only. Grai runs its own complete cold `compile()`
API and native shard layout with declaration output. Without the optimized plugin
the full matrix contains 36 trials; with it, 54.

## Timing and validation

`totalMs` times public Paraglide `compile()` or Grai `compile(config)` after module
imports, including generated JavaScript/declarations and all compiler filesystem
publication work. Fixtures, configuration, harness verification and hashing are
outside the measured window. Inputs were just written, so filesystem caches are
warm; these are fresh builds, not cold-disk measurements.

`importMs` records compiler/dependency import duration. `coldWithImportMs` adds it
to compilation but still excludes Node startup and fixture setup. `entryProcessMs`
records process uptime at entry to the trial function (including Node startup and
static harness imports). `process-results.jsonl` additionally records child
`processWallMs`, which includes startup, fixture creation, compilation, verification
and process exit; it is not an isolated CLI compile measurement. Do not subtract
these numbers to claim a precisely measured startup cost.

Every trial records generated file/type/map counts, bytes, selected plugin SHA256
and a generated-output SHA256. Only the README's absolute fixture project path is
normalized. The harness verifies the actual Paraglide layout file count, catching
an older candidate silently ignoring the shard option. Round zero executes every
message in every locale after timing. This simple fixture cannot establish full
feature parity with Grai or universal runtime parity; separate integration tests
cover selectors, markup, fallback, unsafe identifiers, metadata, strict TypeScript
consumers, middleware, names/arity and tree shaking.

`summary.json` reports median/min/max over three trials. It requires stable
Paraglide hashes within a group and byte-equivalent default/locale output across
the frozen and candidate stacks; candidate shard output must also match across
plugin variants. Grai has its own hash and runtime verification, with no claim of
cross-tool output equality. Timing cannot be interpreted as equivalent behavior
if a paired output assertion fails.

## Phase diagnostics and CPU samples

Use a separate new results directory for phase diagnostics:

```sh
export CATALOG_BENCH_RESULTS=/tmp/catalog-round2-phases
node benchmark/project-catalog/round2/run-matrix.mjs phases
```

This excludes Grai and explicitly times SDK loading, optional project querying,
compileCatalog/compileProject, writing and owned-project closing. Candidate
backends call `loadProjectCatalog`; the baseline phase control calls
`loadProjectFromDirectory`, then queries its nested bundles. Therefore baseline
phase measurements are an explicit old-loader control and may differ from its
public compile route. The full matrix remains the primary end-to-end comparison.

Individual runs use backend, layout, size, round, mode arguments:

```sh
export CATALOG_BENCH_RESULTS=/tmp/catalog-round2-profile
CATALOG_CPU_PROFILE=/tmp/catalog-round2.cpuprofile \
  node benchmark/project-catalog/round2/run-case.mjs catalog-optimized shards 6400 900 full
```

Inspector sampling starts immediately before compilation and stops before harness
readback/runtime verification. Profiling adds overhead; sampled trials are labeled
and excluded from ordinary matrix summaries. The matrix rejects the profiling
variable to avoid mixed measurements and overwritten profiles. Round 900 skips
round-zero runtime verification; use round zero for a standalone correctness run.

These measurements describe the stated local synthetic setup. They do not justify
universal speedups, browser/runtime performance claims, full CLI startup claims,
arbitrary plugin parity, or conclusions about watch/incremental builds.

## Actual CLI process comparison

`run-cli.mjs` separately measures the complete public CLI child process, including
Node startup, all CLI/dependency imports, configuration reading, compilation,
declarations, filesystem writes, and process exit. Fixture creation and parent
verification are outside the timed window. Inputs have just been written, so OS
filesystem caches are warm. This measures fresh output and fresh processes; it
must not be described as cold-disk or incremental performance.

Build and freeze the candidate, its linked SDK, the optimized plugin, and Grai
before running. Only these four path variables are required (the frozen API
baseline/plugin variables are unused):

```sh
export CATALOG_BENCH_CANDIDATE=/absolute/candidate/paraglide-js
export CATALOG_BENCH_OPTIMIZED_PLUGIN=/absolute/candidate/message-format/dist/index.js
export CATALOG_BENCH_GRAI=/absolute/grai
export CATALOG_BENCH_RESULTS=/tmp/catalog-cli-final

# Use the same pinned Node 22 executable for the runner and every child.
node benchmark/project-catalog/round2/run-cli.mjs
```

`CATALOG_BENCH_GRAI` accepts a built checkout, its `dist/cli.js`, or its
`dist/compile.js` (the latter resolves the sibling CLI). The results directory
must be new or empty. Five serial rounds rotate Paraglide/Grai order at each
size, creating 20 fresh CLI processes. `CATALOG_BENCH_ROUNDS` can select another
positive odd count for a separately labeled run. The runner requires Node 22 and
uses its exact `process.execPath` for both tools.

Paraglide runs its actual `bin/run.js compile` with declarations enabled,
`message-modules`, `--message-module-size 512`, `--strategy baseLocale`,
`--no-clean-outdir`, and `--silent`. Grai runs its actual `dist/cli.js compile
--config <file>` with the matching en/de/fr username fixture and its native
output/declarations. Both read explicit fixture configuration; Paraglide's empty
config prevents ancestor options from leaking into the trial.

`cli-results.jsonl` records measured child `processWallMs`, exit-validated output
counts/bytes/SHA256, and CLI output. Round zero executes every generated message
in every locale after timing. Paraglide's shard count and nonempty declaration
output are asserted. Generated hashes are compared only within Paraglide trial
groups, never across tools; runtime verification covers this common fixture and
does not establish full feature equivalence. `cli-summary.json` reports
median/min/max. `cli-metadata.json` records executable/version, artifact paths,
revisions, and selected plugin/CLI/SDK-loader checksums.

## Recorded production results

Local macOS arm64, Node 22.21.1, 2026-10-28. No incremental compilation. Five
rotated, serial fresh-process trials per case; every build emits declarations
and writes all files into an initially absent output directory. Inputs have just
been created, so filesystem caches are warm. Every round-zero build evaluates all
19,200 or 39,900 messages after timing. Default-layout JavaScript/declaration hashes
match the released baseline. Grouped layouts retain strict consumer types and
per-message tree shaking, but deliberately change generated module paths.

The primary released-stack comparison is in `released/`. The baseline is compiler
`7a72c0cf95b5f3e527ecfc3350903ba559e4a797` (compiler source matches main base
`239411bb`) with the actual published SDK 4.0.4 and frozen message-format 4.5.5.
The candidate uses this PR, SDK implementation commit
`b5121df98c2e953aba2ff670c50e706d6b120bea`, and the updated locally built plugin.
Grai is `8af924a6b513d178b8e6d67694bdfb490c7e697f`. None of the SDK/plugin changes
were published for the measurements.

| Keys ×3 locales | Published stack, default files | Candidate, default files | Candidate, groups of512 |   Grai |
| --------------- | -----------------------------: | -----------------------: | ----------------------: | -----: |
| 6,400           |                       3,536 ms |                   583 ms |                   82 ms |  89 ms |
| 13,300          |                       6,899 ms |                 1,151 ms |                  148 ms | 160 ms |

These are public `compile()` plus declarations, hashing and real disk writes.
Compiler-module imports are excluded from that column and reported separately;
SDK imports deferred into `compile()` are INCLUDED. The harness does not preload
the candidate SDK. Including module imports, the grouped candidate/Grai medians
are 98/99 ms and163/171 ms. Complete Node and CLI startup are measured separately
below. The default layout saves about83% of compilation time versus the released
stack; grouping saves about98%. Grouping is opt-in and is required to reach the
Grai baseline in this fixture: default output still creates12,814 or26,614 files,
versus40/66 grouped candidate files and68/116 Grai files.

The other `results.jsonl`/`summary.json` in this directory contain90 additional
five-round trials against the frozen earlier catalog PR implementation, plus
frozen/updated plugin controls and locale layout. They isolate the second-round
improvements; their `sdk` label means that earlier catalog build, not published
SDK4.0.4. That cohort measured grouped candidate85/155 ms and Grai94/166 ms.
Do not combine cohorts into one median. The updated plugin is always explicitly
labeled `catalog-optimized`; its checksum differs from the frozen control.

`provenance.json` documents the measured dirty working trees and built JavaScript
fingerprints. The base commits alone are not the optimized implementation. CPU
summaries are separate, sampled diagnostics and are excluded from timing medians.
They identify message JavaScript generation and allocations/garbage collection as
remaining substantial costs; declaration generation is a much smaller component.
The API profile has only121 samples, so its percentages are coarse. The CLI profile
has1,590 samples and includes startup/module evaluation. Raw local profiles remain
under the task artifacts, not these small reports.

To reproduce the released comparison, build both checkouts and the candidate SDK
and plugin, then set the required absolute paths described above, with:

```sh
export CATALOG_BENCH_ROUNDS=5
export CATALOG_BENCH_CASES=sdk/default,catalog-optimized/default,catalog-optimized/shards,grai/shards
node benchmark/project-catalog/round2/run-matrix.mjs
```

Use the actual released-SDK checkout for BASELINE, preserve the frozen plugin,
and use a new RESULTS directory. A `.noindex` temporary directory avoids indexing
large generated fixture trees on macOS. With CASES unset, all supported cases run;
ROUNDS defaults to3 and must be a positive odd integer.

### Complete CLI result

`cli-results.jsonl`, `cli-summary.json` and `cli-metadata.json` record five rotated
trials through the actual Node CLIs, using the same inputs, local updated plugin,
and512-message grouping. The timer includes `spawnSync`, process startup, module
loading, config discovery, compilation, declarations, disk writes and process exit.
Fixture creation and parent-side output/runtime verification are excluded.

| Keys ×3 locales | Paraglide CLI | Grai CLI |
| --------------- | ------------: | -------: |
| 6,400           |        155 ms |   155 ms |
| 13,300          |        226 ms |   223 ms |

The CLI is effectively at the same baseline here; it is not a claim of a universal
CLI win. The larger-case median is about1% slower, with overlapping trial ranges.
The compile API is faster in these trials, while CLI startup still adds overhead.
Local noise, hardware, filesystem state and project features affect the result.
Complex/nested/annotated catalogs use the compatible general importer and are not
represented by the simple-string throughput numbers.
