# ntfy engine-free mobile follow-up

This supplementary cold mobile pair reuses frozen full-51-locale engine-free artifacts from the prior per-locale-build experiment. It is not a new compiler build or a repeated performance qualification. Source app211ba22860d7483073a8ce13dcda5f467194989b; pinned compiler6997d020813d76f087d585110e62cd54891726e0. The native control uses the same esnext target and native installed Vite8.3.4. Generated per-locale metadata reports the compiler dependency Vite8.1.4/Rolldown1.1.5, separately from the app's actual builder.

French `/login` readiness:3199.1→2933.3ms (8.31% faster); completed encoded HTML+subresource bodies383115→360699B (5.85% fewer). No errors or failed requests. Rendered text and screenshot SHA match exactly. This is below the >10% repeat gate; one pair does not establish a stable timing gain. The native app's splash has a minimum duration; FCP/LCP measure that static splash and do not qualify translation performance.

The candidate uses the prior experimental literal-call codemod and small i18next/React compatibility adapter over compiled messages; the native translation engine is replaced. Its existing migration/semantic limitations remain: foreground French login only, externally selected locale entry, full-document language selection/offline/PWA install not tested. The separate PWA worker retains multiple languages. See the existing `benchmark/real-apps/per-locale-builds/ntfy` package for full app migration artifacts. Do not combine this with output-only Frigate/LibreChat results or claim this uses today's compiler main.

The updated probe precompresses text assets before navigation, samples readiness before waiting for all started requests to finish, includes HTML, and then counts completed ResourceTiming entries whose request started by readiness. Cache/SW are disabled;150ms latency/1.6Mbps download/2Mbps upload/4xCPU, viewport1365×768. Both builds and original semantics are unchanged.

Replay:

```sh
PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs TRIAL_COUNT=1 node probe.mjs /root/repos-iii/ntfy-native-esnext-control/benchmark-output/native-esnext /root/repos-iii/ntfy-per-locale-probe/web/benchmark-output/per-locale/__paraglide/fr-6672 first-pair.json
```

The paths above identify frozen local artifacts. Pass reconstructed output directories to replay elsewhere. Raw failure/readiness/resource data are in `first-pair.json`; PNGs preserve UI parity.
