# Independent Open WebUI auth-route review

Reviewer: GPT-6 Luna, extra-high reasoning. Review date: 2026-10-12.

## Conclusion

The initial candidate is withdrawn: its plural conversion sent ICU-like text to the message-format plugin, which failed to interpolate in some locales. The corrected candidate now has broad catalog parity and a reproducible 10-pair route comparison, but the apparent 12.9% byte reduction against full-catalog i18next is mostly explained by manually scoping the auth route to 106 keys. Against an i18next control scoped to the same keys, Paraglide saves 4.43% encoded route bytes in a one-pair smoke. This does not meet the campaign's >10% compiler-only gate.

The route adapter remains a useful migration experiment for this specific route. It is not evidence that the split compiler alone produces a >10% win over an equivalently scoped i18next implementation.

## Corrected parity and full-native comparison

I independently recalculated `openwebui-auth-ab-corrected-10pairs.json` from the ten alternating native/candidate pairs. Median encoded bodies are 1,311,085 vs. 1,141,881 bytes (−12.906%); transfer totals are 1,330,585 vs. 1,160,781 bytes (−12.762%); translated-ready medians are 1,370.5 vs. 1,222 ms (−10.835%). All ten pairs match full visible text, title, visible controls, `html.lang`, and query-driven `fr-FR → en-US → fr-FR` navigation, with no page errors. I checked the individual resource byte sums against each trial total. LCP is diagnostic because it can track the splash rather than translated readiness.

The run used pinned production builds, a fresh context per trial, no browser cache or service worker, Brotli-Q4, 80 ms RTT, 20 Mbps down / 2 Mbps up, 3× CPU, and the same `locale=fr-FR` storage seed. App source is Open WebUI commit `f8ae8a6c328946dc62cd0712961a0632574581bf`; the compiler package source is `6997d020813d76f087d585110e62cd54891726e0`. Both builds use Vite 5.4.21, SvelteKit 2.68.0, i18next 23.16.8, and ES2022 output. The candidate Vite config imports the compiler checkout's `dist/index.js`, so this verifies that checkout rather than a published package.

I independently rehashed the physical builds using the benchmark's manifest recipe. Native: 5,576 files / 168,103,047 bytes / `db26f771beb6bed9b578284394085d7307e1561e7d0d3eb0ca117c95c79501e4`. Corrected candidate: 5,712 files / 170,192,332 bytes / `1c51cd1ebbe0ac72b8f2fc5e42226160ad7c33d88902731e4d27d1d6e92cd390`. The benchmark manifest's plugin and compiler entry hashes match the checked-out package dist.

The corrected conversion now emits structured `count` declarations and exact-zero/plural selectors. I reran the catalog verifier against the generated candidate: 6,784 static comparisons and 13,760 plural comparisons across 64 locales, with zero mismatches against pinned i18next 23.16.8. Plural probes cover counts 0–200, negative and fractional values, 1,000, and 1,000,000. I spot-checked the Arabic `ar-BH` output and confirmed its selector branches interpolate the count. This fixes the earlier Arabic failure; the early French-only result and its 12.995% figure remain invalid.

## Equal-scope control

The auth inventory contains 106 literal translation keys, 115 calls across ten source modules, and no dynamic calls detected by the route scan. The scan recovers sources from the native loaded route graph's sourcemaps. The native catalog averages 3,882 keys per locale, so the auth set is about 2.7% of the average catalog. Extracting that key set was manual benchmark-adapter work; it is not automatic route extraction provided by the compiler option.

I inspected the native scoped-control generator and independently compared all 64 locale files. Each i18next auth subset contains only selected keys (plus available plural suffixes), with no extras; the control falls back to the same full native resources outside `/auth` and when backend translation overrides are present. The Paraglide input has exactly 106 message IDs in each of 64 locale files. This establishes matched key scope for the control; the corrected catalog verifier separately establishes rendered value parity.

In the one-pair same-scope smoke, native i18next went from 1,311,085 to 1,194,858 encoded route bytes after scoping (−8.865%). Paraglide used 1,141,881 bytes, a further 52,977-byte (−4.434%) reduction versus scoped i18next; transfer bytes were 1,214,358 vs. 1,160,781 (−4.412%). The native-scoped and Paraglide pages matched visible text, title, controls, document language, locale navigation, and had no page errors in that pair. This is a byte comparison from one paired smoke, not a timing study; its readiness delta is diagnostic only. Roughly 69% of the full-native byte reduction is already reproduced by giving native i18next the same manual route key subset. The >10% compiler-only gate is therefore not met.

## Locale behavior and adapter scope

I reran a Node resolution probe using the pinned i18next 23.16.8 detector, 7.2.0 browser language detector, app language list, detector order, and the current parity-fix adapter's `toBundleCode` and requested-vs-resolved behavior. All 64 supported locale codes matched. Tested aliases also matched: `FR-fr` and `fr` resolve to `fr-FR`, `fr-BE` maps to `fr-FR`, and `fr-CA` remains its own locale. Unsupported `zh-HK`, `zz-ZZ`, and `zz` preserve requested language, `<html lang>`, and storage identity while rendered text falls back to `en-US`, matching native i18next. An invalid stored `zz-ZZ` is likewise preserved while text resolves through English.

That requested-identity correction landed after the frozen timed build. I compared source-map `sourcesContent`: the measured `/root/repos-iii/paraglide-native-route-survey/.real-apps/openwebui-paraglide-ab-corrected/build` from 17:52 stored the resolved locale, set `lang` to that resolved locale, and returned `getLocale()`. The separately built parity-only adapter at `/root/repos-iii/paraglide-native-route-survey/.real-apps/openwebui-paraglide-auth-edgefix/src/lib/i18n/paraglide-auth.ts` has SHA-256 `76ce956333f60a735cee836c93a6ba66f6cd903a7537ceeaf9cc07e27c374e5d`; its 18:03 build map embeds that source exactly and its output-tree hash is `9e1f9f6d8027e76df9ad94a02caea9a8e592d90d33da22787116d61c2c8bc051`. It preserves and returns `requestedBundle` while resolving message text through the supported locale or `en-US`. The older behavior is a real mismatch for unsupported locale identifiers; the measured `/auth?lang=fr-FR` route is unaffected because its requested locale is supported and equals the resolved locale. The edgefix build's one-pair visible parity result is not performance evidence. The current resolution probe mirrors the edgefix source, while the separate browser edgefix parity trace verifies `fr`, `zh-HK`, and `zz-ZZ` visible behavior.

The i18next detector catches blocked-storage access, while the adapter directly reads and writes `localStorage`. That difference alone does not establish a migration regression: the original Open WebUI layout already accesses `localStorage.theme` at `+layout.svelte:1248` before `initI18n` at line 1310, and has other direct token reads. The app itself already assumes localStorage is available. I did not run the entire application with browser storage disabled, so I make no whole-app claim for that case.

The adapter is deliberately limited to `/auth`; other routes and override-enabled auth continue to use native i18next. The 10-pair harness uses the read-only config fixture with no translation overrides. A separate browser check of the override branch rendered custom French `Password` and `Sign in` values with no errors; non-auth fallback was checked by source inspection. The route result tests query navigation, not in-place language switching.

## Public API usability probe

I used the documented public `paraglideVitePlugin` API in an isolated two-locale scratch app. The options were `outputStructure: "locale-modules"`, `experimentalClientLocaleSplit: true`, `strategy: ["localStorage", "baseLocale"]`, and `localStorageKey: "locale"`. Vite 8.1.4 required `build.target: "es2022"`; with that target, the build completed and emitted English/French locale chunks. No compiler-private option was used.

The initial browser probe failed because my scratch `index.html` unconditionally rewrote storage to French, overriding the second context's seeded English value. I fixed only the ignored scratch fixture so its default is applied only when no saved locale exists, rebuilt, and reran the probe. With `locale=fr-FR`, startup showed `fr-FR|Bonjour|Connexion`; `await setLocale("en-US", { reload: false })` and then French returned the expected text and storage values without another document request. In a separate English context, `await loadLocale("fr-FR")` fetched the French locale module, after which synchronous `m.greeting({}, { locale: "fr-FR" })` returned `Bonjour` while active locale, storage, and rendered English text remained English. There were no page errors.

The public docs snapshot I checked (`paraglide-client-split-pr4` commit `702c2ddba0d9acc683452783785f6b44fd047cd6`) documents the explicit Vite target, storage key, preload requirement, in-place switch constraints, and explicit message locale calls. The API test is a small Vite/Rolldown integration probe; it does not test this Open WebUI adapter's actual in-place switch behavior.

## Limits and reproduction files

The full-native result is a targeted manual migration experiment, not a general route-scoping result from the compiler. The same-scope control is a one-pair byte smoke, not ten-pair performance evidence. There is no compiler-only >10% result, no measured authenticated/non-auth route result, and no evidence for automatic key extraction. Plural parity is broad for the one extracted plural family, not every possible i18next configuration or formatting plugin behavior.

- Corrected 10-pair browser data: `/root/repos-iii/paraglide-native-route-survey/benchmark/real-apps/results/openwebui-auth-ab-corrected-10pairs.json`
- Corrected artifacts: `/root/repos-iii/paraglide-native-route-survey/benchmark/real-apps/results/openwebui-artifact-manifest-corrected.json`
- Corrected catalog/plural parity: `/root/repos-iii/paraglide-native-route-survey/benchmark/real-apps/results/openwebui-auth-catalog-parity-corrected.json`
- Same-scope i18next smoke and comparison: `/root/repos-iii/paraglide-native-route-survey/benchmark/real-apps/results/openwebui-auth-ab-native-scoped-smoke.json`, `/root/repos-iii/paraglide-native-route-survey/benchmark/real-apps/results/openwebui-auth-ab-native-scoped-vs-paraglide-smoke.json`
- Independent key-scope/byte arithmetic: `benchmark/real-apps/results/luna-openwebui-equal-scope-audit.json`
- Current locale-resolution probe: `benchmark/real-apps/results/luna-openwebui-locale-resolution-probe.json` (current parity-fix semantics)
- Independent physical artifact manifest recheck: `/root/repos-iii/paraglide-luna-ntfy-review/.real-apps/openwebui-audit/artifact-manifest-recheck.json`
- Public API browser transcript: `benchmark/real-apps/results/luna-openwebui-public-api-probe.json`
- Requested-locale parity-only edgefix trace: `/root/repos-iii/paraglide-native-route-survey/benchmark/real-apps/results/openwebui-auth-locale-edgefix-parity.json`; its build hash is in `/root/repos-iii/paraglide-native-route-survey/benchmark/real-apps/results/openwebui-artifact-manifest-all-controls.json`
- Public API scratch app: `/root/repos-iii/paraglide-client-split-current-api/.real-apps/openwebui-luna-ax-final`
