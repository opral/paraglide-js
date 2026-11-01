# Historical catalog benchmark

These measurements record earlier compiler/catalog implementations, including a
scalar importer that has since been removed. Current before/after measurements,
plugin controls and reproduction commands are in
[round3/no-v2](../round3/no-v2/README.md).

The raw results, sampled CPU summaries and artifact provenance remain here as
historical records. Do not use their timing medians to describe the current
implementation or combine them with later cohorts.

## Shared benchmark runner

`run-matrix.mjs` runs serial fresh processes through `run-case.mjs` and validates
output layouts and hashes. `summarize.mjs` reports median/min/max and checks paired
output equivalence. Select explicit backend/layout cases with
`CATALOG_BENCH_CASES`; current reproduction commands select the released SDK
baseline and ordinary-importer candidates only.

The `full` mode measures public compilation, including declarations, hashing and
real output writes, after compiler-module import. Deferred SDK imports remain
inside the measured call. Fixture construction and validation are outside it.

The `phases` mode preloads the SDK and separately records catalog loading,
compilation and writes. Its medians must not be subtracted from `full` medians to
claim precise stage attribution. CPU sampling is diagnostic and belongs in
separate runs, outside timing cohorts.

All generated fixtures have warm filesystem caches because files are written
immediately before the timed operation. These records do not measure incremental
compilation or cold-disk startup.
