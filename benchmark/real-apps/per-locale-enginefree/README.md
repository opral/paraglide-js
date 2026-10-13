# Engine-free per-locale application comparisons

This follow-up addresses the stricter comparison: compiler-generated selected-locale messages with **no native i18next/react-i18next runtime** against optimized native i18next. The previous `per-locale-production` LibreChat/Frigate experiments retained that engine and cannot support an engine-free claim.

| App / measured page | Mobile native → candidate | Result | Qualification |
| --- | --- | --- | --- |
| LocalAI Spanish login (earlier experiment) | 2821.5 → 2220ms | 21.3% faster | Five paired repetitions; private namespace prototype |
| LibreChat French login | 12140 → 12075ms | 0.54% faster | One pair; no >10% gate |
| Frigate French Live | 9988.8 → 10061.8ms | 0.73% slower | One pair; no >10% gate |
| ntfy French login (supplementary frozen prototype) | 3199.1 → 2933.3ms | 8.31% faster | One pair; no >10% gate |

Both new large-app candidates have emitted-module-ID audits proving native engines absent across emitted chunks. They preserve original full source catalogs and normal application Vite optimization/target. Only the measured French engine-free artifacts are emitted; source locale completeness is not presented as a full output-variant or language-switch certification. Inputs were already compiled with pinned public PR813; unchanged compiler-produced functions were reused to avoid SDK re-ingestion. LibreChat adds explicit locale-function export aliases without rewriting function bodies. These are compatibility prototypes, not direct whole-app rewrites to statically imported message calls or released migration APIs. Latest main was separately fetched/checked out at9f72d16b6f45643d26a9443716b17b334cd2d34a; these artifacts retain their exact frozen compiler provenance rather than claiming a fresh main build.

Frigate desktop readiness was1845.3→2037.3ms (+10.4%); initial observed encoded bodies increased0.93% desktop/1.04% mobile. All4captures passed, initial request bodies were drained and included with HTML, and paired screenshots matched exactly. Native and candidate use the same real app route with original E2E read-only API/media/WebSocket fixtures. Actual camera streaming is not measured.

LibreChat desktop readiness was1798→1792ms (0.33% faster). Its static JS entry graph shrank2067800→2060342B under BrotliQ4 (0.36%). Completed initial HTTP bodies shrink2278673→2269724B (0.393%) in both profiles. A persistent media iframe leaves the corresponding whole-body totals bounded at[2278673,2315167] native and[2269724,2306218] candidate; the finished media range body is already counted once. The actual public forgot-password page also passes a desktop pair1730→1713ms with exact French text/placeholders; it is not labeled a lazy route.

LocalAI's earlier repeated mobile gain and15.4% H1 paint improvement are real scoped laboratory results, but the new larger-app comparisons do not reproduce a20% advantage. Raw single-pair timings are diagnostics, not a stable speedup/regression claim. Desktop/mobile network/CPU/viewport and readiness definitions are recorded per application.

[LocalAI full replay](../per-locale-production/localai/README.md) · [LibreChat](librechat/README.md) · [Frigate](frigate/README.md) · [ntfy](ntfy/README.md). Independent GPT6Luna xhigh source/evidence reviews record actual native oracle coverage and unsupported/unmeasured behavior.
