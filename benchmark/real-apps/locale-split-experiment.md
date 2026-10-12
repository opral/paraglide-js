# Automatic Vite locale-splitting experiments

## Final feature and qualifying mobile profile

The final implementation at source commit `4cbb10af` has freshly rebuilt
public-plugin artifacts and per-report output hashes, independently rehashed
by GPT-6 Luna. At 1.6 Mbps / 150 ms / 4× CPU, ten paired cold trials show
483,357 → 420,675 B transfer (−13.0%) and 2,478 → 2,144 ms FCP/LCP
(−13.5%) versus the current default Paraglide layout. Five pairs against
the native eager-i18next control show 1,004,417 → 420,675 B (−58.1%) and
4,992 → 2,124 ms FCP/LCP (−57.5%). All paired text matched with zero errors.
The final fast-profile ten-pair repeat (20 Mbps / 80 ms / 3× CPU) confirms
the tradeoff: 540 → 614 ms FCP/LCP (13.7% slower), despite the same byte saving.

See `results/anything-final-mobile-4g-repeat.json`,
`results/anything-final-mobile-native-vs-split.json`,
`results/anything-final-fast-repeat.json`, and [the independent audit](luna-public-mobile-review.md).
The source, metadata and output hashes are bound in every final report and
the final section of `anything-llm-public-build-manifest.json`.

Commit `a602364` adds a configuration-time multiple-project guard and documentation;
it does not change the emitted message/runtime graph measured at `4cbb10af`.
The recorded compiler artifact hash identifies the measured build, not a later rebuild.

Earlier qualifying observations below predate the final nullish-locale
semantics correction and remain archived with their original build hashes.

The initial feature now combines client locale splitting with compact indexed
payloads. The historical labels “PR4 namespace” and “PR5 indexed text” below
refer to experiment worktrees, not two published PRs. The arrays alone saved
only 2.7% of AnythingLLM route transfer and 6.2% in Stirling-PDF, so they were
folded into the initial feature instead of receiving a separate optimization PR.

The earlier indexed-text public-plugin Vite 4.5.3 production artifacts were tested at
1.6 Mbps down, 2 Mbps up, 150 ms RTT and 4× CPU, using fresh browser contexts
and the same Brotli-Q4 server and read-only API fixtures. These historical build hashes
match `anything-llm-public-build-manifest.json`'s indexed-text Vite4 artifacts.
Neither source minification nor a different Vite version accounts for the delta.

| Comparison | Trials per variant | Subresource transfer | Median FCP/LCP |
| --- | ---: | ---: | ---: |
| Default Paraglide → final split, first run | 5 | 483,357 → 420,668 B (−13.0%) | 2,720 → 2,380 ms (−12.5%) |
| Default Paraglide → final split, quiet repeat | 10 | 483,357 → 420,668 B (−13.0%) | 2,634 → 2,244 ms (−14.8%) |
| Native eager i18next → final split | 5 | 1,004,417 → 420,668 B (−58.1%) | 5,056 → 2,208 ms (−56.3%) |

All 40 contexts rendered exactly `Bienvenue\nCommencer` without page errors.
These are same-origin **subresource transfer** counters, including response
headers and excluding the HTML navigation. They are not complete application
downloads or field Web Vitals. The native control is the pinned app's existing
eager all-locale import with equivalent locale-picker metadata, previously
reviewed in `luna-anything-migration-review.md`; it was served and measured again,
not substituted with its old timing values. This does not compare against an
i18next integration deliberately rewritten to lazy-load translations.

The earlier default-layout fast-network result also showed a regression: at
20 Mbps / 80 ms / 3× CPU, 483,357 → 420,668 B saves 13.0%, while FCP/LCP
576 → 640 ms is 11.1% slower. The opt-in is therefore a measurable tradeoff,
with the demonstrated paint improvement on the constrained-network profile.
The complete selected and base locale still load; this is not zero overhead
or automatic route-key pruning.

The reports are `results/anything-public-mobile-4g.json`,
`results/anything-public-mobile-4g-repeat.json`, and
`results/anything-public-mobile-native-vs-split.json`. Use the public replay
below and set `ANYTHING_DOWNLOAD_MBPS=1.6 ANYTHING_LATENCY_MS=150
ANYTHING_CPU_RATE=4 ANYTHING_ROUTE_TRIALS=10`; both artifact directories must
remain pinned. `route-perf-public.mjs` records the actual profile in its JSON.

The actual virtual facade also matched the physical generated graph across all
31 locales / 1,257 keys: 116,901 text comparisons and 1,488 markup-parts
comparisons with sample counts 0, 1, 7 and `SAMPLE` inputs. This Node ESM probe
does not establish browser hydration or every possible input value. The
source-independent native catalog and narrow browser-rich checks remain
separate evidence below.

This ledger records the AnythingLLM route experiment for automatic locale-module loading. It compares split and unsplit builds of the same generated Paraglide locale-modules output; it is not a direct i18next-versus-Paraglide result.

## Fixture

- Pinned source: AnythingLLM commit `2a10d052a1812d7be12c43f9024072cf26a27a8b`.
- Catalog: 31 locales, 1,257 generated message exports, including plural and markup messages.
- Route: `/onboarding`, browser locale `fr-FR`, expected visible text `Bienvenue\nCommencer`.
- Runtime strategy: `globalVariable`, `localStorage`, `preferredLanguage`, `baseLocale`, with `i18nextLng` as the storage key.
- Build: Vite 4.5.3, `target: esnext`; browser: Chromium 143; 80 ms RTT, 20 Mbps down, 2 Mbps up, 3x CPU throttle; Brotli Q4, cache disabled.
- Five alternating route pairs; the harness checks text parity and page errors.
- The generated output uses `compileBundle({ inlineMessages: false })`, `createLocaleFunctionLocalNames`, and `locale-modules.generateOutput`, matching `compileProject`'s locale-modules path. The Vite fixture runs `packLocaleFunctionChunk` in both variants.

## Prototype

The client Vite plugin redirects the generated `messages.js` to a synchronous facade. The facade dynamically imports the generated locale module before `setLocale(locale, { reload: false })` resolves, and it keeps the existing synchronous message-call API. The `setLocale` wrapper uses the runtime's `toLocale`, so case-insensitive values such as `ZH-TW` retain canonicalization. Concurrent locale changes use a latest-request token. SSR continues to load the original generated graph.

An HTML module bootstrap starts loading the base and runtime-detected startup locales before the app entry. The base locale stays loaded because an unsupported explicit `options.locale` falls back to the base message synchronously. The generated per-locale modules in this fixture contain literal fallbacks and do not import the base locale themselves.

## Measurements

The strict hook-level paired report is `.real-apps/anything-migration/route-perf-ablation-report-vite4-ts-strict.json`; it tests the TypeScript `createClientLocaleSplitPlugin` hook with a source-derived sidecar. Full public compiler-path reports using `paraglideVitePlugin` are listed below. Those runs use a generated inlang project from the 1,257 source bundles. Each build starts with a cold generated output directory; the compiler writes `client-locale-split.json` itself, and the driver compares its message records with independent metadata derived from the same source bundles. The public-path default, explicit locale-modules, and split builds use the same generated app adapter and Vite config; only the compiler option changes.

| Build | Median transferred bytes | Median FCP/LCP | Median long-task time |
| --- | ---: | ---: | ---: |
| Locale modules, split disabled | 860,039 B | 784 ms | 63 ms |
| Locale modules, TypeScript split hook enabled | 433,510 B | 684 ms | 76 ms |

That is 49.6% less route transfer and 12.8% lower median FCP/LCP. Median long-task time rose from 63 to 76 ms (20.6%). All five pairs rendered identical `Bienvenue\nCommencer` text with no page errors. The split build emitted 31 locale chunks; this route requested only `en` and `fr` plus the shared registry. Across the split trials, the base and selected locale modules transferred 22,332 B and 25,058 B, the registry 840 B, preload 374 B, and split runtime 3,182 B. The full route transferred 433,510 B.

The baseline exercises the real packer: its 12,493,932 B pre-minify chunk became 8,378,468 B before Vite minification. The split build keeps locale functions in direct-export locale chunks, so that packer leaves those chunks untouched. The Vite config includes the same packer hook in both paths.

The earlier TypeScript-hook run used an older prebuilt unsplit artifact; it is preserved as `.real-apps/anything-migration/route-perf-ablation-report-ts-vs-prior-baseline.json`. The current run rebuilt the baseline from the same fixture with the split plugin omitted, then reran the alternating route pairs. The earlier scratch-plugin paired run is preserved as `.real-apps/anything-migration/route-perf-prototype-ablation-report.json` and is superseded by the current result.

The earlier `inlineMessages: true` fixture was incorrect for locale-modules. Its 8,071,705 B chunk had no textual `eval(` or `with(` matches and Acorn found no direct eval calls or `WithStatement`s. The packer returned `null` because its helpers were not eligible: 900 functions interpolated inputs, 36 static functions were additionally read through `.parts`, and 460 functions were rich `Object.assign` wrappers. After changing to the compiler's locale-modules policy (`inlineMessages: false`), the active packer ran; no source change or removal of its lexical guard was needed.

An earlier split-only run used `inlineMessages: true` and lacked the active packer path; its measurements were superseded by the table above. The old clean-catalog Paraglide baseline is also not a valid comparator: it predates the current generated locale-modules output and app adapter. A prior split-versus-that-baseline run showed lower transfer but slower FCP and was discarded as an apples-to-oranges comparison.

## Correctness probes

- The app language selector retained all 31 locale options and order.
- Initial English, then French selection rendered `Bienvenue`.
- A `setLocale("ZH-TW", { reload: false })` probe returned canonical locale `zh-tw`.
- The current generated catalog passed 38,192 ordinary message comparisons and 837 plural comparisons against i18next, across all 31 locales; nine regional locale cases passed.
- The TypeScript plugin dev graph retained the same 31 options and locale order. The test rendered French, matched `k12` text and `.parts()` to the physical French module, matched a plural message, and confirmed an unknown explicit message locale falls back to the base module. A 500 ms German chunk delay during overlapping `de` then `fr` requests left `fr` active; `ZH-TW` canonicalized to `zh-tw`. There were no page errors.
- With the TypeScript split hook enabled for Vite SSR, `ssrLoadModule` kept the full generated graph and AsyncLocalStorage returned the English and French `k12` text independently for concurrent `en` and `fr` contexts.
- Earlier independent review passed split-mode 31-locale loading, `en → de → en`, latest-request-wins switching, plural text and `.parts()` parity for `k12`, base fallback for unknown message locales, chunk rejection handling, AsyncLocalStorage SSR, and HMR detection of a newly added locale. Those earlier prototype-only checks are not being presented as TypeScript-plugin checks.
- Locale key pruning did not happen: a route importing one message still retained all 1,257 exports in each selected locale chunk.
- Vite 4.5.3 requires `target: "esnext"` for the generated top-level-await boundary; its default Chrome 87 target rejects it. Do not silently override an app's build target in the public plugin.

## Rejected or incomplete approaches

- Duplicating the full generated dispatcher index once per locale exceeded the 4 GB build memory limit and was discarded.
- A virtual locale module that re-exports the actual generated `messages/<locale>.js` avoids duplicating dispatcher code and preserves plural/markup helpers, but the current dynamic namespace facade retains all keys in every locale chunk.
- Removing the base preload can save the base chunk when the selected locale is different, but it breaks synchronous fallback for an unsupported explicit message locale unless the implementation adds another way to produce the base result. Keep the preload for strict behavior parity until a tested alternative exists.

## Full public Vite plugin runs

The public-plugin replay scripts are `anything-migration/build-public-variants.mjs`, `anything-migration/prepare-public-project.mjs`, and `anything-migration/route-perf-public.mjs`. `build-public-variants.mjs` creates the source-derived bundle catalog, adapts the pinned app, creates a real inlang project, snapshots only the app adapters, deletes the generated output directory, then runs the requested clean Vite builds. Use `PARAGLIDE_PUBLIC_COMPILER_WORKTREE` to point at the compiler worktree and optionally `PARAGLIDE_PUBLIC_VITE_BIN` to hold the Vite version constant. Set `PARAGLIDE_PUBLIC_VARIANTS=default,locale,split` to build all controls. For the PR5 static-text metadata shape, also set `PARAGLIDE_STATIC_TEXT_METADATA=true`.

The Vite 4.5.3 public-plugin measurements use the pinned app's native Vite and `target: esnext`, with the same Chromium 143 / French onboarding route / 80 ms RTT / 20 Mbps / 3x CPU / Brotli Q4 harness. The default layout means `paraglideVitePlugin` with no `outputStructure` option; the explicit locale-modules control retains all synchronous helpers, and split is the opt-in client-locale-splitting option. The default-to-split result is the relevant current-default comparison; locale-modules-to-split isolates splitting against the compiler's locale-module output.

Each row below is one paired five-trial report; separate reports have separate medians for the same candidate build.

| Public Vite4 paired comparison | Left median (transfer / FCP / long tasks) | Right median (transfer / FCP / long tasks) |
| --- | ---: | ---: |
| PR4 default `message-modules` → split | 483,357 B / 560 ms / 51 ms | 432,227 B / 648 ms / 68 ms |
| PR4 explicit `locale-modules` → split | 862,019 B / 840 ms / 92 ms | 432,227 B / 664 ms / 63 ms |
| PR5 default `message-modules` → split with static-text payloads | 483,357 B / 576 ms / 57 ms | 420,668 B / 640 ms / 54 ms |

Every public Vite4 pair rendered exactly `Bienvenue\nCommencer` in all five trials with no page errors. PR4 split reduced bytes 49.9% and FCP 21.0% versus explicit locale-modules, but the current default-layout comparison reduced bytes only 10.6% and regressed FCP by 88 ms (15.7%). PR5 split reduced bytes 13.0% versus its default and regressed FCP by 64 ms (11.1%); it was only 2.7% smaller than PR4 split for this route. These 20 Mbps results do not establish a startup improvement for current default apps on that profile; the constrained-network qualification and its repeated measurements are reported above.

The main FCP delay is visible in the Vite4 split waterfall: the HTML-injected preload starts at 89 ms, the shared split core starts at 90 ms, but the `en` and `fr` locale module requests do not start until 227–230 ms. In the paired default build, the app entry finishes at 444 ms and first-trial FCP is 568 ms (five-trial median 560 ms); split's app entry finishes at 491 ms and first-trial FCP is 616 ms (median 648 ms). A modulepreload probe moved the locale requests to 92 ms, but the paired FCP did not improve (744→748 ms); adding the locale registry as another early modulepreload also did not help (624→636 ms, same transferred bytes). Vite already emits a `<link rel="modulepreload">` for the shared split core in the HTML. The remaining FCP cost is not explained by just moving these network requests earlier.

PR5 compiler metadata described 1,208 of 1,257 bundles as static in at least one locale, with 37,205 locale text values. On the French onboarding route, the generated `en` and `fr` chunks dropped from 22,362+25,191 B in PR4 to 15,895+18,108 B in PR5, while total route transfer dropped only 11,559 B (2.7%) from PR4 split. The full catalog and rich `<Trans>` parity checks passed for PR5 output, but these route results do not show a 10% incremental whole-page win over PR4 split. A separate cold Vite4 production app used the public plugin and split facade to render `agent.mcp.tool-count-warning`; its English and French DOM markup matched native i18next `<Trans>` exactly, including `<span>` and `<br>` components. The replay script and output are `anything-migration/client-split-components.mjs` and `results/anything-llm-public-vite4-pr5-trans-facade.json`. This is a focused facade parity probe, not a claim that every rich message was exercised through the facade.

The same PR4 public builds were also measured with Vite 8.1.4 as a toolchain cross-check. That build is not the app-native Vite comparator. Its route transfer was 560,407→479,832 B (−14.4%) and FCP 1,476→1,424 ms (−3.5%) for default→split, while explicit locale-modules→split was 907,969→479,832 B (−47.2%) with essentially flat FCP (1,396→1,392 ms). Vite4 and Vite8 numbers are kept in separate JSON reports and are not pooled.

The portable route reports are `results/anything-llm-public-vite4-default-vs-split.json`, `results/anything-llm-public-vite4-locale-vs-split.json`, `results/anything-llm-public-vite4-pr5-default-vs-split.json`, the two `results/anything-llm-public-vite4-pr5-preload-*.json` diagnostic reports, the PR5 `<Trans>` facade probe, and the three `results/anything-llm-public-vite8-*.json` files. PR5's physical generated message graph passed 38,192 ordinary comparisons, 837 plural comparisons, 9 locale-region cases, and 496 `<Trans>` renders. The `/onboarding` route tested the client split facade with the app's static messages; the additional production facade probe checks one rich `<Trans>` key in English and French against i18next. The exact source commits, generated metadata hash, and PR5 Vite4 output tree and entry hashes are in [anything-llm-public-build-manifest.json](results/anything-llm-public-build-manifest.json). Generated sources, the inlang project, app adapters, and production outputs stay in ignored `.real-apps/anything-migration`. The strict TypeScript-hook report above remains distinct from these public compiler-path reports.

## Optimized i18next control and revised campaign gate

The campaign now considers only optimized i18next setups for migration claims.
The existing eager AnythingLLM comparison above is historical evidence, not a
qualifying migration result under that gate. A separate app-local diagnostic
control retains the pinned i18next 23.12.1, React bindings, language detector,
31 catalogs, locale-picker metadata, and ordinary fallback/interpolation
settings. It replaces eager resource imports with a Vite dynamic-import backend,
loads `common` and awaits initialization before application execution. Both
sides target `esnext`; no catalogs or keys are removed.

Five alternating cold French onboarding pairs at 1.6 Mbps / 150 ms / 4× CPU
show lazy i18next **425,019 B / 2,320 ms FCP/LCP**, versus split Paraglide
**420,675 B / 2,128 ms**: **1.0% fewer bytes and 8.3% faster paint**. Exact text
matches and page errors are empty in all trials. This first diagnostic does
not clear either >10% gate. Long-task medians rise 56 → 64 ms. The raw report is
`results/anything-lazy-i18next-mobile-vs-split.json`, with both artifact tree
hashes. Its `compilerCommit` field is null; its split output hash matches the
independently audited final `4cbb10af` artifact above. This control is a deliberate
app-local optimization, not the unchanged native repository configuration.
It does not establish compatibility across authenticated/lazy routes or a
language-switch parity matrix. Earlier full-catalog/native checks cannot be
attributed to this newly changed initialization path.

Reproduce after the main AnythingLLM replay creates the native metadata control:

```sh
node benchmark/real-apps/anything-migration/build-lazy-native-control.mjs
ANYTHING_LEFT_DIST=.real-apps/anything-lazy-i18next-control/dist \
ANYTHING_RIGHT_DIST=.real-apps/anything-public-split-dist \
ANYTHING_LEFT_NAME=lazy-i18next ANYTHING_RIGHT_NAME=split \
ANYTHING_DOWNLOAD_MBPS=1.6 ANYTHING_LATENCY_MS=150 ANYTHING_CPU_RATE=4 \
ANYTHING_ROUTE_TRIALS=5 \
ANYTHING_PUBLIC_REPORT=.real-apps/anything-lazy-i18next-control/mobile-vs-split.json \
  node benchmark/real-apps/anything-migration/route-perf-public.mjs
```

The route harness also accepts `ANYTHING_LEFT_PORT` / `ANYTHING_RIGHT_PORT`.
Serialize browser timing and compiler builds on the host; separate ports do
not prevent CPU contention. Further optimized-native experiments should test
startup scheduling on both sides as well as emitted bytes.
