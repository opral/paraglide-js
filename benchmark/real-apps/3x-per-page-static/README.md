# Per-locale + static message imports: real 3x-ui experiment

Pinned application: MHSanaei/3x-ui
`74c3cc38821cabd66ad316ea562851422d0b0063`. Compiler base:
`f0f4be8782af89ebb18fdbcd6f4dd140418ea6f0`, with the archived private patch
allowing the existing message-modules output in per-locale builds. Actual host:
Node 22.23.2, Vite 8.3.4, Rolldown 1.2.12. Compiler-produced locale manifests
contain the compiler package's different Vite/Rolldown versions; use actual host
provenance here instead.

## Result: login only

The final registered build preserves all 13 locale inputs × 2,589 message keys.
All 13 locale builds and all three HTML entries were built, with the original
manual chunk configuration. Spanish login and invalid-submit errors match native.
No catalog keys were removed. Physical compiled exports and input counts were
checked independently; 33,657 message/locale combinations were invoked. This is
not an exhaustive behavioral equivalence test of every production screen.

Five cold pairs per profile, alternating variant order, give:

| Metric (median timing) | Optimized i18next | Registered Paraglide | Reduction |
|---|---:|---:|---:|
| Initial compressed response bodies | 756,862 B | 649,839 B | 14.1% |
| Desktop translated controls ready | 1,159.9 ms | 1,109.4 ms | 4.4% |
| Mobile translated controls ready | 5,368.5 ms | 4,536.3 ms | 15.5% |
| Mobile first contentful paint | 4,628 ms | 4,172 ms | 9.9% |
| Desktop invalid-submit validation | 466.8 ms | 430.2 ms | 7.8% |
| Mobile invalid-submit validation | 482.5 ms | 452.4 ms | 6.2% |

All 20 final browser samples pass rendering and validation checks with zero
recorded page/network errors. This is a local experiment under fixed synthetic
throttling, not field Core Web Vitals or statistical proof across deployments.
Readiness requires visible Spanish username/password fields and submit button;
it is recorded before response hashing. Byte accounting waits for requests
begun before readiness to finish, including in-flight requests. Server bodies
are precompressed before measurement. Browser cache and service workers are
disabled. Desktop: 80 ms RTT, 20 Mbps, 3× CPU. Mobile: 150 ms, 1.6 Mbps, 4× CPU.
Both use the same viewport, localhost HTTP/1.1, and fixture API responses.

## Experiments and qualifications

1. Literal calls were automatically migrated in 175 files, retaining 61 genuine
   dynamic calls and unknown literal keys. Direct physical imports alone still
   ship the complete catalog because FormField translates dynamic error keys.
   That candidate saves only 7.9% versus native. `direct-final-result.json`
   records the rejected result.
2. Deferring the dynamic catalog until validation saves 14.2% initially, but
   makes validation substantially slower: median mobile 478 → 4,031 ms.
   `five-pairs.json` records this rejected interaction tradeoff.
3. The final follow-up automatically registers the functions each app module
   already imports. Dynamic lookups first reuse those functions; unknown keys
   retain the complete asynchronous catalog fallback. Login's validation keys
   are already imported, so validation no longer downloads the catalog.
   Registration adds 219 B to the static graph versus experiment 2.

This is a private app integration, not a published automatic compiler feature.
The compiler layout patch alone has not earned this 14.1% claim. Panel and
subscription entries still preload the complete selected-locale catalog before
rendering, because unknown dynamic calls also occur in effects/events and
unwrapped render paths. Do not describe this as every page shipping only its
messages, zero localization overhead, or a 40% whole-app improvement.

An additional matched compiler-layout control keeps every non-generated app
source file identical, including registration and loading behavior. Both builds
have all 13 × 2,589 inputs and three HTML entries; the locale layout gets all
2,589 physical re-export facades so it accepts the exact same app imports.
Its login static graph is **723,914 B** versus message layout **649,700 B**:
**10.25% smaller** from changing the output layout. One browser correctness pair
per profile confirms both render the same Spanish UI and validation messages,
with no errors. Actual initial response bodies are 724,053 versus 649,839 B.
`layout-control-pairs.json` records those checks; it is not a repeated timing
comparison. This isolates the output-layout benefit within this integration;
the 14.1% comparison to i18next additionally includes the app migration.

GPT-6 Luna xhigh independently reviewed the two integration iterations: the
login registry path is safe under the fixed-locale/full-reload contract, but
removing the other entry preloads is unsafe. Registration boilerplate and the
render-only Suspense lookup require a clearer compiler-owned production API.

## Artifacts and replay

`registered-five-pairs.json` contains final raw samples and response hashes;
`registered-summary.json` contains median timing summaries. Earlier raw samples
and rejected graph results are retained with distinct filenames. The failed
initial harness run blocked a local read-only POST endpoint; it is excluded
from all reported results. The final fixture permits only GET/HEAD plus that
specific read-only `/getTwoFactorEnable` POST, with no external requests.

`registered-app-source.patch.gz` records the final source/config change relative
to the frozen optimized native app, excluding compiler-generated output.
Codemod scripts, compiler patch, full input counts/hashes, generated counts,
source/dist/compiler hashes, exact build commands and build logs are archived.
Large reports/logs are gzip-compressed, preserving original contents. Codemod
and config absolute paths reflect this experiment workspace; adjust them when
replaying elsewhere.

Prepare the pinned app and the previous native early-locale control. Preserve
all original `internal/web/translation` files. Prepare `.real-apps/messages`
and `.real-apps/project.inlang` using the earlier per-locale experiment scripts;
those must be sibling directories (the SDK resolves message paths there).
Apply the source patch from the app root, prepare the private compiler at the
recorded main revision with `compiler-message-layout.patch`, then build with
the exact createBuilder/buildApp command in `registered-build-provenance.json.gz`.
Do not substitute a single-environment `vite build`. Check counts before testing.

Start `serve.cjs` independently with native/candidate `DIST_ROOT` and `PORT`.
Run `probe.mjs` with `PLAYWRIGHT_MODULE`, `NATIVE_ORIGIN`, `CANDIDATE_ORIGIN`,
`PAIRS=5`, and `OUTPUT_FILE`. Never rebuild a dist currently being served.
