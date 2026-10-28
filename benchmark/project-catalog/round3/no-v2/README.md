# Current ordinary-import benchmark

These fresh measurements supersede scalar-hook performance claims for the active
implementation. The candidate uses optimized ordinary `importFiles` and
`loadProjectCatalog`; neither SDK loading nor either selected plugin exposes
`importFilesV2` or `tryImportCatalog`. Older measurements remain historical.

Local macOS arm64, Node 22.21.1, five rotated serial fresh processes per case.
Inputs contain 6,400 or 13,300 keys across en/de/fr with one username input.
Every compile emits declarations and writes into a new output directory.
Inputs were just written, so OS filesystem caches are warm; this is not a
cold-disk or incremental benchmark.

## Public compile API

| Keys ×3 locales | Released SDK stack, default | Candidate, default | Candidate, groups of512 |
| --------------- | --------------------------: | -----------------: | ----------------------: |
| 6,400           |                 4,189.83 ms |          726.06 ms |               140.18 ms |
| 13,300          |                 9,897.80 ms |        1,772.95 ms |               314.58 ms |

The default layout saves about 82–83% of elapsed compilation time (5.6–5.8×
faster). Grouping saves about 97% versus the released-SDK default baseline.
These are contemporaneous measurements; do not combine medians with historical
cohorts.

`totalMs` measures public `compile()` after compiler-module imports, including
SDK imports deferred into compilation, catalog loading, JavaScript/declaration
generation, hashing and real disk writes. Fixture creation, output verification,
Node startup and CLI startup are excluded. Module imports are recorded separately
as `importMs`/`coldWithImportMs`. The child `processWallMs` additionally includes
fixture setup and verification; it is not an isolated CLI measurement.

Round-zero trials executed every generated message and locale after timing.
Default candidate JavaScript/declaration hashes match the released baseline after
only README-path normalization. Grouping deliberately changes direct module paths
and creates 40/66 files versus 12,814/26,614 default files.

## Preloaded-SDK loader control

| Keys ×3 locales | Frozen message-format4.5.5 | Updated ordinary importer | Less loader time |
| --------------- | -------------------------: | ------------------------: | ---------------: |
| 6,400           |                 112.583 ms |                 65.585 ms |           41.75% |
| 13,300          |                 258.012 ms |                144.882 ms |           43.85% |

The `load` phase directly calls `loadProjectCatalog({path, fs,
writePluginCache: true})` with SDK modules preloaded. It includes settings,
local-plugin/resource reads, plugin evaluation, ordinary parsing, SDK JSON
validation/copying/normalization and nested assembly. It excludes SDK module
loading, code generation and writes. Both plugins use the same current SDK.
Five rounds per size/plugin produced identical generated hashes.

The full and phase controls are separate cohorts: SDK preloading changes module
state and GC timing, so their medians cannot be subtracted for precise full-API
stage attribution. Simple-string throughput does not establish performance for
nested catalogs, selectors, markup, annotations, multiple importers or repeated
locale resources; compatibility tests cover those behaviors separately.

## Evidence and reproduction

`full/` contains 40 primary raw/process rows and their summary. `phases/` contains
20 loader-control rows and summary. `provenance.json` records commits, dirty source
state, built-JavaScript checksums, selected plugin checksums and no-V2 assertions.
The SDK changes were measured before their final commit; its base commit alone
is not the measured no-V2 implementation. The baseline resolves actual published
SDK4.0.4 without the catalog API, with compiler source matching main base239411bb.

Build and freeze both compiler checkouts, the candidate SDK and updated plugin.
Use the existing round2 harness, absolute paths, the same pinned Node22 binary,
and a different new results directory for each cohort:

```sh
export CATALOG_BENCH_BASELINE=/absolute/released-sdk/paraglide-js
export CATALOG_BENCH_CANDIDATE=/absolute/candidate/paraglide-js
export CATALOG_BENCH_PLUGIN=/absolute/frozen/message-format/dist/index.js
export CATALOG_BENCH_OPTIMIZED_PLUGIN=/absolute/no-v2/message-format/dist/index.js
export CATALOG_BENCH_ROUNDS=5

CATALOG_BENCH_RESULTS=/tmp/catalog-no-v2-full \
CATALOG_BENCH_CASES=sdk/default,catalog-optimized/default,catalog-optimized/shards \
node benchmark/project-catalog/round2/run-matrix.mjs full

CATALOG_BENCH_RESULTS=/tmp/catalog-no-v2-phases \
CATALOG_BENCH_CASES=catalog/shards,catalog-optimized/shards \
node benchmark/project-catalog/round2/run-matrix.mjs phases
```

Keep the frozen control intact. The selected updated plugin checksum was
`0aff1308418564264a713be0c0351f84f81678c0c615d23577074f2c304a6d6b`.
These measurements do not replace actual CLI timing; a new no-V2 CLI claim would
require a fresh CLI cohort.
