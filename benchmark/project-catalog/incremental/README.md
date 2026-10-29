# Incremental compilation and recovery

Measured 2026-10-28 on macOS, Node 24.22.1. Five serial fresh-process trials per
size/implementation, with implementation order rotated each round. Three locales
(en/de/fr), flat JSON catalogs, one input per message, declarations enabled,
`cleanOutdir: false`, and the default one-message-per-module layout. Times include
catalog loading, generation, hashing and real filesystem writes through public
`compile()`. Module imports, process startup, fixture creation and verification
are outside the timer. Inputs and output are in a warm filesystem cache.

The baseline is the saved local stateful-loader implementation immediately before
selective generation and hash reuse. It already includes the database bypass and
direct declaration emitter; it is not the published Paraglide/SDK stack.

| Keys | Scenario | Baseline median | Current median | Time saved |
| ---: | --- | ---: | ---: | ---: |
| 6,400 | Unchanged | 86.0 ms | 11.6 ms | 86.5% |
| 6,400 | First translation edit | 126.2 ms | 72.7 ms | 42.4% |
| 6,400 | Subsequent distant edit | 134.3 ms | 56.1 ms | 58.2% |
| 6,400 | Input change | 129.9 ms | 57.7 ms | 55.6% |
| 13,300 | Unchanged | 176.3 ms | 23.6 ms | 86.6% |
| 13,300 | First translation edit | 258.9 ms | 159.7 ms | 38.3% |
| 13,300 | Subsequent distant edit | 274.7 ms | 123.0 ms | 55.2% |
| 13,300 | Input change | 256.4 ms | 129.1 ms | 49.7% |

Translation edits write one file, input changes two, and unchanged builds none.
Key additions/deletions use the full emitter: at 13,300 keys they measured
250.5 → 269.6 ms and 281.7 → 242.2 ms respectively. Fresh builds measured
694.5 → 644.8 ms at 6,400 keys and 1,315.9 → 1,421.6 ms at 13,300 keys.
This work improves rebuilds; it does not establish a fresh-build speedup.

The SDK still runs the ordinary importer and normalizes the whole resource after
an edit. Its separate SDK-only measurements put the first edited load at 132.6 ms
for 13,300 keys. That points to importing/normalization as the next major cost;
the separate timers are not an additive breakdown of this benchmark. Hash-map
traversal, output copying and result cloning also remain proportional to output
size. Shared/grouped layouts still regenerate completely on actual edits.

`results.json` contains all 30 trials, `summary.json` their medians/ranges and write
counts, and `metadata.json` the implementation fingerprints. The optional Grai
comparison uses commit `e1293d8d37d535b96f79c4de176945dec680610c`. Its 13,300-key
translation edit measured 14.1 ms, but it uses a different compiler, runtime,
parser, declaration format and sharded output (114 initial files versus 26,614).
It is a reference, not an output-compatible replacement or isolated emitter test.

## Verification

Each measured trial compares its final JavaScript and declarations with a fresh
full emission. Validation mode compares after every step, including plurals,
Unicode keys, changed inputs, additions/deletions, invalid JSON with preserved
output, recovery, and settings/options/plugin invalidation. Compiler tests cover
selective bundle compilation, full-emitter fallbacks, module-name collisions,
three concurrent callers, failed clean publication, filesystem changes and
caller-mutated hash maps. SDK tests cover detached ASTs and load recovery.

The saved browser observations in `browser-*-results.json` record real Vite HMR:
normal translation edits retain the same page boot count; invalid JSON produces
an overlay/500; recovery reloads automatically and displays fresh text. Both
message and locale layouts were checked. Message layout additionally covers key
deletion and re-addition. The Vite regression test disables the watcher and
reproduces the cached-transform recovery race deterministically.

## Reproduction

Build the SDK and candidate compiler, linking the candidate SDK as described in
the parent README. Retain a separately built baseline with its own SDK dependency
resolution; pointing both compilers at the same new SDK may change the comparison.
Use the same built message-format plugin for both. Run from any directory:

```sh
export CATALOG_BENCH_CANDIDATE=/path/to/candidate/paraglide-js
export CATALOG_BENCH_BASELINE=/path/to/frozen/baseline
export CATALOG_BENCH_SDK=/path/to/inlang/packages/sdk
export CATALOG_BENCH_PLUGIN=/path/to/message-format/dist/index.js
export CATALOG_BENCH_RESULTS=/tmp/incremental-results
node "$CATALOG_BENCH_CANDIDATE/benchmark/project-catalog/incremental/trial.mjs" current 300 validate
node "$CATALOG_BENCH_CANDIDATE/benchmark/project-catalog/incremental/run.mjs"
```

Optionally set `CATALOG_BENCH_GRAI` to the built reference checkout to include it.
The adapter reads its bundled `dist/bench.js` recompile export and is specific to
the recorded revision. The saved baseline distribution and linked dependencies
are local development artifacts; source fingerprints identify this candidate,
but a baseline must be retained separately to reproduce the exact comparison.
