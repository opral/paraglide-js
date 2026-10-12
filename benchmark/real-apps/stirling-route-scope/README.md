# Stirling-PDF consumer-scoped locale payload experiment

This is a negative route-level experiment, preserved to avoid repeating a design that reduced message ownership but did not improve the user path. It uses the pinned Stirling-PDF source commit `313794c573df5e92d2f020f5ec53d08b264d6e4f`, Vite 7.3.6, i18next 26.3.6, a French startup locale, local Brotli-Q4 serving, 80 ms RTT, 20 Mbps down, and 3x CPU. The application preview blocks backend/API and third-party traffic, so the measurements represent this frontend route only.

## Results

The 10-pair native comparison is the primary result. The optimized native i18next backend loads the selected French TOML and English fallback. The scoped Paraglide prototype statically rewrites the imports it can analyze and splits message values by consumer owner group.

| Variant | Transfer bytes | Encoded body bytes | FCP | LCP | Resources |
| --- | ---: | ---: | ---: | ---: | ---: |
| Optimized native i18next | 1,126,852 | 1,108,852 | 820 ms | 2,092 ms | 60 |
| Consumer-scoped Paraglide | 1,130,180 | 1,059,080 | 7,160 ms | 9,500 ms | 237 |

The scoped variant increased transfer by 0.30%, increased decoded response bytes from 3,970,229 to 5,212,618, and increased resource count by 177. Its encoded body bytes were 4.49% lower, but the page waited on many more requests and its FCP/LCP were much slower. French route text matched. The application adapter was not a full i18next migration: dynamic calls and rich `<Trans>` behavior were not validated by this scoped route check, so this is not evidence of whole-application semantic parity.

The Vite graph contained 5,443 modules, 192 entries, 882 message consumers, and 42 locales. The safe consumer analysis covered a union of 6,753 of 9,823 compiled message functions. Owner-set splitting produced 168 groups; multiplying those by 42 locales was too costly. The route prototype used a two-pass graph discovery and coalesced groups instead. Two diagnostic route builds still failed the payload gate:

| Variant | Transfer bytes | FCP | LCP | Resources | French text |
| --- | ---: | ---: | ---: | ---: | --- |
| Native, merged-initial run | 1,126,852 | 812 ms | 2,008 ms | 60 | pass |
| Two-pass, seven groups promoted into initial | 1,338,558 | 760 ms | 2,000 ms | 68 | pass |
| Native, eight-bucket run | 1,126,852 | 772 ms | 1,996 ms | 60 | pass |
| Two-pass, eight lazy buckets | 1,388,768 | 704 ms | 2,456 ms | 96 | pass |

Promoting the seven groups did not produce an initial-route win: `HomePage` mounts `LandingPage` and `FileManagerView` on the observed route, so several scopes classified as lazy were requested immediately. The eight-bucket variant added 36 requests and 23.2% transfer bytes; its LCP was 460 ms slower. These are single-pair diagnostic smokes rather than a final statistical timing study, but the request and byte regressions are large and consistent with the design's ownership fanout.

The graph experiments also had high build costs. Exact owner grouping produced 168 locale groups; an attempted 4 GB heap build exhausted memory, and 4/8 GB prototype attempts were not consistently buildable. The eight-bucket output contained 2,255 files and took about 60 seconds in the recorded build. The merged-initial build completed in about 52 seconds. This complexity is not justified by the measured route output.

## Reproduction inputs

The compact measurement artifact is [`../results/stirling-route-scope-negative.json`](../results/stirling-route-scope-negative.json). It contains all 10 native/scoped trials, the two diagnostic browser smokes, compact graph manifests, source pins, and SHA-256 hashes of the source JSON inputs. The summarizer accepts the original JSONs and manifests as arguments:

```sh
node benchmark/real-apps/stirling-route-scope/summarize-stirling-route-scope.mjs \
  /path/to/native-vs-scoped-10pair.json \
  /path/to/browser-initial-merged-smoke.json \
  /path/to/browser-smoke-fr.json \
  /path/to/owner-manifest.json \
  /path/to/manifest-initial-plus-lazy07.json \
  /path/to/manifest-bucket8.json \
  benchmark/real-apps/results/stirling-route-scope-negative.json
```

`route-two-pass-vite-plugin.mjs` is the Vite discovery/apply prototype used by the scratch harness. For a fresh app checkout, generate locale-modules output first, then run `vite build` from `frontend/editor` with `STIRLING_PARAGLIDE=1`, `STIRLING_ROUTE_TWO_PASS=discover`, `STIRLING_PARAGLIDE_OUTPUT=<generated-output>`, `STIRLING_ROUTE_MANIFEST=<owner-manifest.json>`, and `STIRLING_FRONTEND_ROOT=<frontend/editor>`. The Vite config must resolve the archived plugin file. The discovery pass writes the owner manifest. Run `coalesce-manifest.mjs <owner-manifest.json> <bucket8.json> 8`, then `merge-initial-groups.mjs <bucket8.json> <merged-initial.json>` to reproduce the two alternative groupings. Build the apply variant with `STIRLING_ROUTE_TWO_PASS=apply` and `STIRLING_ROUTE_MANIFEST` set to one of those manifests.

The plugin loads TypeScript and MagicString from the pinned frontend through `STIRLING_FRONTEND_ROOT`. The original full manifests/build logs are kept in the ignored `.real-apps` scratch tree, not checked into the repository; the committed compact result stores input hashes and the counts needed to audit the grouping decisions.
