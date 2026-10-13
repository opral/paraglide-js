# Per-locale production-app comparisons

These experiments compare language-specialized Vite production output with optimized native i18next controls. All original catalogs are preserved; route message keys are not manually selected. Both arms use each application's installed Vite, unchanged production target and matched cold browser conditions. Encoded HTTP body counts include HTML and initially in-flight assets; they do not include headers. Backend startup fixtures are identical read-only responses in both arms. These are laboratory route tests, not field Core Web Vitals.

| Application / route | Native optimization | Candidate scope | Mobile translated readiness | Whole-page bodies |
| --- | --- | --- | --- | --- |
| LocalAI login, Spanish | Lazy catalogs, early auth preload, auth-only initialization barrier, bundled English auth fallback | Private engine-free namespace prototype | Five-pair median 2821.5 → 2220ms (21.3% faster) | 1157613 → 1149335 bytes (0.715% fewer) |
| LibreChat login, French | Selected locale initialized before rendering, early locale preload, separate static English fallback | Public PR813 compiled resources; i18next retained | One pair 12297 → 12178ms (1.0% faster; diagnostic) | Completed bodies +0.148%; persistent media navigation separately bounded |

LocalAI desktop readiness improves 1230.2 → 1204.1ms (2.1%); mobile FCP/final observed H1 LCP improves 2564 → 2168ms (15.4%). All 20 repeated captures pass identical Spanish text and zero page errors, failed requests or attempted writes. Its critical startup entry falls 96817 → 74493 compressed bytes; total request count rises 27 → 28. The private namespace/compiler compatibility work is not a released/public PR813 feature, and this adapter's bounded compatibility checks do not certify every application path.

LibreChat preserves all 41 catalogs, 3516 union keys, original sparse locale membership and English/regional fallback. It is an output-only control, not an engine-free migration. Its static JS graph is 0.069% larger, and no >10% repeat gate passed. A hidden audio iframe leaves its bootstrap Document request open; the finished media body is counted once and the pending body is bounded explicitly. See its replay for details.

Changing language requires navigating/reloading into the chosen language build, unlike the native applications' in-place language switch. Each package records this behavior and full-catalog/compiler/toolchain provenance.

Replays: [LocalAI](localai/README.md), [LibreChat](librechat/README.md). Frigate's first adapter caused excessive shared-message request fan-out; a namespace-grouped refinement is being evaluated separately.
