# Shared-factory facade ablation on optimized Ntfy

This negative experiment replaces repeated generated message-wrapper bodies with one shared factory. It preserves wrapper arity, stable exported identities and attached rich-parts functions in the focused fixture, but changes inferred function names and is not a supported compiler transform. Vite still performs production minification. No product source from this experiment is included in the draft stack.

The same pinned Ntfy optimized HTTP-backend control (`211ba22860d7483073a8ce13dcda5f467194989b`, Vite 8.3.4, i18next 26.4.2) loads only French and English JSON. The candidate uses the complete app-local Ntfy compatibility adapter and #801 source `e293fe7` plus the committed research patch. Both retain the original PWA precache size limit and build successfully.

One fresh-context diagnostic pair uses the Ntfy route harness: Brotli quality 4, cache disabled, service workers blocked, 80 ms RTT, 20 Mbps down, 2 Mbps up, 3x CPU. Readiness waits for the original splash to clear and the exact French login UI to become visible. Both runs pass this predicate without page errors.

| Metric | Optimized native | Shared-factory prototype |
| --- | ---: | ---: |
| Requested encoded resource bodies | 383,115 B | 376,624 B (−1.69%) |
| Resource transfer including headers | 387,315 B | 382,024 B (−1.37%) |
| Requested decoded resource bodies | 1,192,768 B | 1,173,682 B (−1.60%) |
| Usable login readiness | 1,413 ms | 1,431 ms (+1.27%) |
| Requested resources | 14 | 18 |

The existing #801 split build requests 377,441 encoded bytes on this route. The factory saves another **817 B (0.22%)**, despite reducing decoded code by roughly 32 KB. This is below the >10% route gate. The single pair does not establish timing differences. FCP and LCP paint the static splash and are not used as localization-readiness results. The eight focused Vite/API tests pass; this does not establish full application or locale-switch compatibility of the research factory.

The [raw diagnostic pair](results/ntfy-facade-factory-smoke.json) records its source patch SHA-256 and measured resource graph. The [research patch](round2-experiments/facade-factory-prototype.patch) applies to a separate compiler checkout at `e293fe7`; run `pnpm run env-variables` and `pnpm exec tsc --build` there. Use a separate copy of the prepared Ntfy web fixture, retain its node_modules, run its Vite config from that web directory, and set `PARAGLIDE_PLUGIN_MODULE` to the prototype compiler's physical dist, `NTFY_LOCALE_SPLIT=1` and a unique `NTFY_BUILD_NAME`. Never overwrite frozen controls. The portable Ntfy preparation, migration and route harness are documented in the Ntfy report.
