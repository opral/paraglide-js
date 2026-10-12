# Open WebUI auth-route comparison

This is a real production-build comparison for Open WebUI's `/auth?lang=fr-FR` route. The app already lazy-loads the selected i18next locale plus its `en-US` fallback, so its original build is an optimized-native baseline. The first Paraglide comparison used a 106-key auth-only adapter; an equally scoped i18next build shows that most of the apparent route win came from limiting the auth route's catalogs.

## Results

| Build | Captured route bytes | Static shipped assets | Static assets vs full native | Loaded locale-message payload |
| --- | ---: | ---: | ---: | ---: |
| Native i18next, full catalogs | 1,311,085 B | 1,304,987 B | baseline | 121,411 B |
| Native i18next, auth-scoped to the same 106 keys | 1,194,858 B | 1,188,772 B | −8.905% | 4,379 B |
| Paraglide client-locale split | 1,141,881 B | 1,135,841 B | −12.962% | 3,372 B |
| Paraglide default output, no client-locale split | 1,228,519 B | 1,222,489 B | −6.322% | 97,157 B |

“Captured route bytes” is the full-browser request total in the original traces. “Static shipped assets” is a second denominator derived from those same traces that excludes the HTML document, mocked `/api/config`, and `/ws/socket.io` responses. The browser harness serves the SPA index for the unimplemented Socket.IO poll endpoint; one extra poll adds another copy of the approximately 2.8 KB HTML body. This explains the variable 2,858 B difference between two split traces; it is not a different build or translation chunk. Original route totals are preserved in the raw captures.

The 10-pair native-full versus split run reports a conventional even-sample median of **1,370.5 ms → 1,222 ms** to translated, usable auth UI, **−10.835%**. The paired route body falls **12.906%** and transfer bytes fall **12.762%**. Every pair matched the complete visible text, title, controls, document language and the French/English query-navigation check, with no page errors. Readiness requires the splash to be gone and French password/login text to be visible. LCP is diagnostic because the splash can be its largest-contentful element.

That comparison does not isolate a compiler advantage. With the same 106-key/64-locale auth catalog, the one-pair static-asset comparison is **1,188,772 B native i18next → 1,135,841 B Paraglide split (−4.453%)**. Its one-sample readiness difference (1,262 ms → 1,182 ms) is diagnostic only. This is below the strict 10% route-byte gate, and there was no reason to spend another timing batch on this candidate.

The default-versus-split control uses the same adapter and catalogs. In its one-pair route graph, static assets fall **7.088%** with locale splitting, but the single readiness sample is slower (1,166 ms → 1,193 ms). Do not read this as a performance estimate. Its source map shows 64 locale modules and the index combined in a 97,157 B route chunk; the split build requests the French and English chunks separately (1,828 B + 1,544 B encoded). The native-scoped selected catalog is 2,775 B + 1,604 B; original i18next requests 72,194 B + 49,217 B for those same two complete catalogs.

Static assets are the dominant ceiling in this route: the Inter variable font alone contributes 804,612 encoded bytes in every build. Route catalog chunk reduction therefore translates into a much smaller whole-route change. The Paraglide adapter also changes the app's auth-route import graph, so the 4.453% equal-scope result is an app integration result, not a compiler-only attribution.

## Scope and parity

The route inventory found **106 literal keys, 115 call sites, and 10 source modules**, with no dynamic translation-key calls in the captured route graph. The native control filters those keys (including the `Starting in {{count}} minutes` suffix family) into locale-specific auth bundles. It still uses the app's pinned i18next 23.16.8 resolver, its English fallback and original full-catalog loader on other routes and whenever backend translation overrides are present.

The Paraglide conversion uses native i18next-resolved text and structured plural declarations/selectors/matches with raw `{count}` interpolation. Catalog parity passed with 0 mismatches across 6,784 static-key comparisons and 13,760 plural comparisons (0–200, negatives, fractions, 1,000 and 1,000,000) over 64 locales. A separate parity-only build fixed requested-locale state for short aliases and unsupported codes: `fr` resolves to `fr-FR`, while `zh-HK` and `zz-ZZ` keep their requested `lang`/storage values and render the English fallback, matching i18next. That build is separately hashed and is not the performance capture.

The frozen performance split/default builds use the prior adapter locale-state code for unsupported locale IDs; the measured `fr-FR` route is unaffected. For an exact source replay, set `OPENWEBUI_PRESERVE_REQUESTED_LOCALE=0` during migration; the generated adapter matched the measured build's embedded source map byte-for-byte. The default migration behavior now preserves i18next's requested-locale state, and the resulting split build is archived as a parity-only diagnostic.

The adapter is bounded to the auth route and its literal-key inventory; it is not a whole-app migration. The auth page has no in-place locale picker, so navigation checks use `/auth?lang=...` reloads. Backend overrides deliberately stay on native i18next. Other routes, dynamic keys outside the captured graph, and full-app migration semantics are not qualified by these measurements.

## Reproduction and artifacts

Pinned source is Open WebUI commit `f8ae8a6c328946dc62cd0712961a0632574581bf`; tool versions are Node 22.23.2, Vite 5.4.21, SvelteKit 2.68.0, i18next 23.16.8 and Chromium 143.0.7499.4. Paraglide source is `/root/repos-iii/paraglide-client-split-current-api` at `6997d020813d76f087d585110e62cd54891726e0`; the compiler file hashes and frozen output-tree hashes are in `results/openwebui-artifact-manifest-all-controls.json`.

From this benchmark checkout, with the pinned Open WebUI dependencies installed in `.real-apps/open-webui-source/node_modules`:

```sh
git -C .real-apps/open-webui-source worktree add --detach "$PWD/.real-apps/openwebui-i18next-auth-scoped" f8ae8a6c328946dc62cd0712961a0632574581bf
ln -s ../open-webui-source/node_modules .real-apps/openwebui-i18next-auth-scoped/node_modules
node benchmark/real-apps/prepare-openwebui-i18next-auth-scoped.mjs
(cd .real-apps/openwebui-i18next-auth-scoped && node --max-old-space-size=8192 node_modules/vite/bin/vite.js build --target es2022)

git -C .real-apps/open-webui-source worktree add --detach "$PWD/.real-apps/openwebui-paraglide-ab-corrected" f8ae8a6c328946dc62cd0712961a0632574581bf
ln -s ../open-webui-source/node_modules .real-apps/openwebui-paraglide-ab-corrected/node_modules
OPENWEBUI_CANDIDATE="$PWD/.real-apps/openwebui-paraglide-ab-corrected" OPENWEBUI_CLIENT_LOCALE_SPLIT=1 OPENWEBUI_PRESERVE_REQUESTED_LOCALE=0 PARAGLIDE_COMPILER_ROOT=/root/repos-iii/paraglide-client-split-current-api node benchmark/real-apps/migrate-openwebui-auth.mjs
(cd .real-apps/openwebui-paraglide-ab-corrected && node --max-old-space-size=12288 node_modules/vite/bin/vite.js build)

OPENWEBUI_PARAGLIDE_WORKTREE="$PWD/.real-apps/openwebui-paraglide-ab-corrected" OPENWEBUI_PARAGLIDE_BUILD="$PWD/.real-apps/openwebui-paraglide-ab-corrected/build" OPENWEBUI_CLIENT_LOCALE_SPLIT=1 node benchmark/real-apps/openwebui-artifact-manifest.mjs
OPENWEBUI_AB_TRIALS=10 OPENWEBUI_TEST_LOCALE_NAVIGATION=1 node benchmark/real-apps/openwebui-auth-ab.mjs
node benchmark/real-apps/summarize-openwebui-route-assets.mjs
```

The raw paired run is `results/openwebui-auth-ab-corrected-10pairs.json`; scoped-native and default/split diagnostics are separate one-pair files. `results/openwebui-route-asset-attribution.json` recomputes the static denominator and selected-locale message bytes without rerunning the browser. The parity-only edge-fix run is `results/openwebui-auth-locale-edgefix-parity.json`; do not substitute its artifacts for the frozen measured split build.
