# Localization target audit exclusions and prerequisites

This archive keeps three target investigations reproducible and records why each is excluded from a compiler-performance claim. No product changes or successful Paraglide migration are represented here.

| Project | Pinned source | Finding | Decision |
| --- | --- | --- | --- |
| Trilium | `TriliumNext/Trilium` `0340a668c3c277303808ab6cb2445538b83710fd` | Its French pre-auth route requests only `entry`; the entire i18next runtime plus French/English entry catalogs can save at most 6.64% of the route's accounted Brotli-Q4 bytes. | Exclude: native already isolates the route namespace, and the theoretical ceiling is below the campaign's 10% threshold. See [Trilium route audit](trilium-entry-route.md). |
| Frigate | `blakeblackshear/frigate` `ff9eb8f18430198548d9c9d2cf138ed9ac7b526b` | Current initialization lists all 29 namespaces despite route-scoped hooks and lazy-loaded pages. A conservative French Live catalog set is about 83,080 Brotli-Q4 bytes versus 162,542 for all en+fr catalogs; these are source/catalog estimates only. | Do not compare against current eager native setup. Any follow-up needs a matched optimized-native lazy namespace baseline and must preserve `objects`/`audio` dynamic labels. See [Frigate namespace audit](frigate-namespace-loading.md). |
| Stirling-PDF | `Stirling-Tools/Stirling-PDF` `313794c573df5e92d2f020f5ec53d08b264d6e4f` | `compileProjectForVite` hit `LIX_READ_RESOURCE_EXHAUSTED` at the 64 MiB/1,000,000-row read budget for 9,823 bundles / 42 locales, before output generation. | Exclude under the explicit Lix/Inlang out-of-scope rule. Do not treat direct-compiler bypasses as production builds. See [Stirling Lix audit](stirling-lix-read-budget.md). |

The existing Stirling route measurements are kept separately in [`stirling-route-scope/README.md`](../../stirling-route-scope/README.md). They compare a scoped prototype with an optimized native lazy-i18next setup and show no route improvement; the adapter did not prove complete application semantics.

## Provenance

These notes were assembled on 2026-10-12 from source snapshots and generated-output inventories. Trilium's native build completed with its checked-in 4 GiB heap cap; Frigate was audited from pinned source and catalog files without a build; Stirling's project-generation attempt and excluded direct-compiler diagnostic are described separately. Route/catalog accounting is explicitly identified as static wherever no browser network trace was captured.
