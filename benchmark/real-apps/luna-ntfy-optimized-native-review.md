# Luna review: Ntfy optimized-native control and client-split API

Reviewer: GPT-6 Luna, extra-high reasoning. This is an independent, read-only audit of the Ntfy production-route negative control and a docs/source-based usability pass over the client locale-split API. I did not rebuild or mutate either measured artifact, and did not run the browser harness because the benchmark owner reserved the build/timing window. This report separates independently recomputed checks from checks reported by the benchmark author and project owner.

## Ntfy result

The result is correctly classified as a negative experiment. Ten alternating fresh Chromium-context pairs at 80 ms RTT, 20 Mbps down, 2 Mbps up, and 3x CPU used the French `i18nextLng` preference and waited for the splash to disappear and the translated login form to be visible. All 20 observations report French parity, no page errors, and no failed requests.

| Median | Native optimized i18next | Paraglide split | Change |
| --- | ---: | ---: | ---: |
| Visible translated login | 1,432 ms | 1,431 ms | 0.07% faster |
| Brotli-Q4 bytes requested by route | 383,115 B | 377,441 B | 1.48% fewer |
| Decoded route bytes | 1,192,768 B | 1,206,155 B | 1.12% more |
| FCP / LCP | 196 ms | 280 ms | 42.9% later |

I recomputed the conventional medians from the recorded trials and independently recompressed the recorded resource files with Brotli Q4. The medians match the JSON and every per-resource encoded-byte value matches (14 native resources, 18 candidate resources). The benchmark's own provenance block pins the app at `211ba22860d7483073a8ce13dcda5f467194989b`, Node `v22.23.2`, i18next `26.4.2`, react-i18next `17.0.15`, Vite `8.3.4`, and records SHA-256 tree fingerprints for both measured distributions.

The gate conclusion is sound: this does not approach the requested 10% route-byte or visible-ready improvement. FCP/LCP should remain secondary because they capture the static splash, while the app enforces a one-second minimum splash and fades. The candidate is slower on those paint metrics despite effectively equal visible readiness.

The native app is already using HTTP-backed lazy locale JSON. On the measured French route it fetches only `fr.json` and fallback `en.json`; the split candidate also fetches only the selected and base locale payloads. The generated locale payload falls from 18,235 B to 13,352 B Brotli, but the split core, preload, registry, and a 76,906 B `Close` chunk erase almost all of that benefit. The `Close` chunk is parser-initiated in the initial route graph even though it belongs to the lazy EmojiPicker module graph. The app's adapter also constructs an all-key `Trans` lookup, limiting key pruning.

There is one attribution caveat: the split Vite config sets `build.target: "esnext"` for top-level await; the native build leaves Vite's target at its default. This is a practical candidate configuration and the negative result remains valid as a comparison of the shipped native setup against the candidate setup, but the byte delta is not a strictly same-target compiler attribution. A follow-up isolated compiler attribution should build both sides at a common supported target. Native source maps are enabled and the candidate disables them; source maps are not requested in the measured route, so this does not explain the route-byte result.

The semantic adapter is appropriately marked as benchmark-only. It maps static literal translation calls, provides an all-key path for dynamic calls and React `Trans`, and bridges locale changes into React. Parity covers 25,143 generated/native calls over 51 locales, plural counts 0, 1, 3, 5, and 100, unknown-locale fallback, plus a named rich-markup check; the app's adapted i18n tests pass. This is useful evidence for the measured login path, not proof of a supported drop-in migration for arbitrary dynamic keys or all rich translation constructs.

## Two-turn API usability evaluation

I treated these as documentation-and-source tasks, not as a runtime integration probe. The public docs reviewed were `docs/compiling-messages.md`, `docs/strategy.md`, `docs/basics.md`, and `docs-api/compiler-options.md` in the current PR4 checkout. No browser/build claims below are implied.

**Turn 1 prompt:** “Set up Vite client locale splitting for this app; preserve its existing `i18nextLng` localStorage value.”

The docs explain the Vite flag and required `build.target: "es2022"` (or newer) for top-level await, but the short feature config does not show how to carry over a non-default storage key. I had to follow the compiler-options reference and strategy guide to assemble the app configuration:

```ts
export default defineConfig({
  build: { target: "es2022" },
  plugins: [paraglideVitePlugin({
    project: "./project.inlang",
    outdir: "./src/paraglide",
    strategy: ["localStorage", "baseLocale"],
    localStorageKey: "i18nextLng",
    experimentalClientLocaleSplit: true,
  })],
});
```

The existing value is preserved by configuring the same key and selecting local storage before the base fallback. The public docs do not offer an i18next codemod/bridge, so the app still needs to migrate message imports and React locale subscriptions. The guide clearly says the split mode retains the full message-key set in each base/selected locale payload and recommends measuring the production route.

**Turn 2 prompt:** “Now switch to German without reload, preserve i18next’s SPA update, and support `m.foo(..., {locale: "fr"})`; what about Vite `minify:false` cache?”

The documented calls are:

```ts
import { loadLocale } from "./paraglide/locale-loader.js";
import { setLocale } from "./paraglide/runtime.js";
import * as m from "./paraglide/messages.js";

await setLocale("de", { reload: false });
// The app must publish its own reactive update; Paraglide does not notify React.

await loadLocale("fr");
const preview = m.foo(inputs, { locale: "fr" });
```

`setLocale` writes the locale through the configured strategy and the split wrapper loads the locale before changing runtime state. The warning in Basics is important for an i18next-style app: `reload: false` does not re-render React or update `<html lang>`, direction, or other document state. The application must own those updates. Explicit per-message locale overrides remain synchronous, so the caller needs to preload that locale first. If the app installs `overwriteGetLocale` or `overwriteSetLocale`, the docs require preload sequencing; the custom setter replaces the split wrapper.

For `build.minify: false`, no extra Paraglide option or message-call change is needed. The reviewed `#801` fix preserves private split metadata while leaving normal debug helper names, and rejects/rebuilds a persistent cache entry that lacks split metadata/loader output. The project owner reports the focused cold-build/cache regression cases passed and the full suite was 641 passed, 5 skipped across 57 files. I did not rerun them in this review.

## Optimization judgment

For Ntfy, Vite already keeps the native catalog lazy at locale granularity, so splitting selected and fallback JSON into generated chunks does not unlock a new route boundary. To beat the 10% route gate, a future design would need to remove more bytes from the initial route graph: for example, key-level pruning that does not retain every key through the dynamic `Trans` map, or resolving why `Close` is eagerly requested. Locale payload compression alone is not enough here. The benchmark supports stopping this candidate for Ntfy; it does not support a general performance claim or default enablement.

The parent also reports a separate source-factory ablation in the #801 ledger: eight focused API/build fixtures passed, but the native-vs-factory route was only 1.69% smaller and the change from the locale-split baseline was 0.22% (817 B); the `.name` prototype change is not supported API. I have not independently rerun that ablation. It reinforces the same gate conclusion: helper-shape changes do not address the initial route's dominant shared assets and eager dependency.

## Artifacts and limits

- Ntfy benchmark report: `benchmark/real-apps/ntfy-results.md` in the benchmark worktree.
- Raw trials and artifact provenance: `.real-apps/ntfy-ab/ntfy-paraglide-ab.json`.
- Public API docs reviewed: `docs/compiling-messages.md`, `docs/strategy.md`, `docs/basics.md`, and `docs-api/compiler-options.md` in the PR4 checkout.
- No build, browser test, service-worker test, offline test, or full-app route audit was run by this reviewer. The browser result covers `/login` only, blocks service workers and API traffic, disables cache, and compares the candidate's `esnext` target to the native Vite default target.

## Subsequent same-target control

After this read-only review, the benchmark author built the native `esnext` control separately and verified identical SHA-256 bodies for all 14 requested resources. The one paired follow-up retains the 1.48% encoded-byte difference and shows no readiness improvement. Its [raw control](results/ntfy/native-esnext-control.json) is now committed. This resolves the target-attribution caveat for route bytes; these later checks were performed by the benchmark author, not independently rerun by this reviewer.
