# Frigate static fallback metadata experiment

This isolated experiment tests whether Vite's client-locale-split metadata can resolve literal text through the compiler's locale fallback chain. It does not change the Paraglide public API. The compiler's generated locale modules already follow this fallback chain; the split plugin's `staticTexts` metadata did not, so the English literal helper could remain reachable even when French supplied the same message through fallback.

## Result

On Frigate's 3,039-message, 33-locale catalog, the baseline metadata included 2,942 English static entries and 2,227 French static entries. The candidate resolves fallback text using the compiler's existing fallback map and includes 3,039 static entries for both English and French. The test also covers `de-AT → de`, `fr-CA → fr`, a dynamic message that must remain non-static, and the compiler's current single-variant behavior.

For the French startup subgraph, Brotli Q4 output was 103,430 B before and 67,701 B after, a 35,729 B (34.55%) reduction. The candidate removes the baseline's 42,379 B English fallback helper from this cold subgraph, while the French locale file grows from 27,754 B to 34,582 B (+24.6%). The English locale file changes from 29,610 B to 29,782 B; the split core shrinks from 3,036 B to 2,686 B. If the English helper is already cached, a fresh French locale request could cost about 6.8 KB more. That is a cache-interaction risk, not a measured warm-cache result.

A single, non-timing Playwright capture against the two frozen builds recorded 95 vs. 94 resource events (94 vs. 93 distinct URLs). Those response bodies totaled 876,626 B vs. 840,894 B, including 14 B of identical mocked API responses on each side. The requested built static assets alone were 88 vs. 87 files totaling 876,612 B vs. 840,880 B (−35,732 B, −4.08%). The union has 105 paths including the document and hashed build assets. Both renders had `html.lang=fr`, title `Frigate`, and identical visible body text, `Le système est sain`; neither had uncaught page errors. The static server returned 404 JSON for backend API calls and did not implement WebSockets; the browser logged the expected failed API and WebSocket requests. This is a limited frontend smoke of the app's health shell, not a usable dashboard route or a timing comparison. An earlier full-route estimate based on outputs without reliable compiler-dist provenance is withdrawn; no full-page performance result is claimed.

The implementation is preserved as [an unapplied source patch](static-fallback-metadata-prototype.patch), based on the product source at `e293fe7`. Apply it only in an isolated compiler checkout and rebuild that checkout. This draft does not enable the metadata experiment.

## Reproduction and provenance

- Compiler source base: `e293fe7a6f24bb2a80666a179cbb724ef3d84feb`.
- Control compiler source: `6997d020813d76f087d585110e62cd54891726e0`; control `dist/compiler/compile-project.js` SHA-256: `b33d9b94202115af242af1e1d01f53bdc7014e838cc91d918ab3049968216a5a`.
- Metadata-only source diff SHA-256: `523f12b1daec2250a48abacafb67d8ff80d458ba7a05c881a99deaec8ed319fe`; candidate `dist/compiler/compile-project.js` SHA-256: `5bb8286e16dcfda9e966435c1f0d2f5e0f9692faa5bd87c3edf1003af4ae9b8d`.
- Client split plugin leaf SHA-256 on both control and candidate: `c06f8dd894f68f6040deeb8ff62d449d4b133fb12bb78520dd5e7f9a5c49dd70`. Both generated client cores retain the default base-plus-selected startup `Promise.all`; the selected-only probe was not in these builds.
- Frigate source: `ff9eb8f18430198548d9c9d2cf138ed9ac7b526b`.
- Build environment: Node 22.23.2, Paraglide package 2.27.0, Vite 8.3.3, Rolldown 1.2.13.
- Compiler tests: `npx vitest run src/compiler/compile-project.test.ts --reporter=dot` (75 passed, 4 skipped); `npx tsc --noEmit` passed.
- Frozen browser trees: control `c2aa69bbcd93f98ac417ee0d7f465b280631f94c802a4bd7ddc3393501819d74`; candidate `84084f067203daaf344a4c9b3c2a1c0a656d1e7f97226bb2534f6f04ec17ea88`.
- Browser graph, text, output hashes, and exact tree hashes: [frigate-static-fallback-smoke.json](results/frigate-static-fallback-smoke.json). The browser run is diagnostic only; it records no timing claim.

The pinned Frigate app copy used `.real-apps/vite.static-fallback-control.config.ts` and `.real-apps/vite.static-fallback.config.ts`; both used the same adapter, Vite target, catalog, and route. The control compiler dist came from the pinned current compiler path above; the candidate compiler dist was rebuilt from this metadata-only source and the unchanged client-split plugin. The frozen output trees are the exact app build outputs listed in the smoke JSON. The separate selected-only startup experiment is not part of these output trees or this source patch.

The current metadata projection mirrors `locale-modules`: use a message at the requested locale when present, otherwise follow the compiler fallback map, and finally use the message ID if no fallback locale defines it. It does not change locale selection, runtime loading, or message-call behavior. The observed cold subgraph saving is useful compiler evidence, but the limited full-route result and cache tradeoff do not justify enabling this metadata change by default or claiming a user-important >10% win.
