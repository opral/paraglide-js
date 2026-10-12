# Independent review: experimental Vite client locale splitting

Reviewer: GPT-6 Luna, extra-high reasoning. Repository: `paraglide-client-split-pr4`, source commit `c51350a` with benchmark commit `d54f8c4` and the final override guidance in `docs/compiling-messages.md`.

## Findings

I found no remaining correctness blocker in the reviewed client path after the build-hook ordering fix and the override guidance update. The feature is clearly opt-in and keeps the generated server graph unchanged. The public integration remains one Vite option, `experimentalClientLocaleSplit`; it selects locale-module output internally, while compiler-private state and wrappers stay out of the package-root API.

The important integration constraint is top-level await: client builds require an explicit target of ES2022 or newer (or `esnext`). This is validated in `configResolved` and stated in the docs. The package peer range starts at Vite 5, so Vite 4 is outside the supported range; I did not test it. Vite 6 and Vite 8 were exercised below.

Runtime overrides need the newly documented preload contract. A custom getter installed from application entry code runs after the generated message facade and HTML preloader may already have loaded the default locale, so the app must call `await loadLocale(getLocale())` before rendering. A custom `overwriteSetLocale` replaces the plugin's async wrapper; its callback must await `loadLocale(locale)` before committing an in-place change. I ran the emitted virtual modules with both patterns: the custom getter selected German after preloading, and the custom setter switched German back to English after preloading. Both synchronous message calls returned the expected text.

The remaining product limitations are explicit and acceptable for an experimental mode: locale chunks contain the complete selected locale rather than pruning message keys; the facade eagerly exposes the full `m` namespace; generated HTML early preload insertion currently targets `index.html`; and `setLocale(locale, { reload: false })` is intended for a fully client-rendered surface that owns rerendering, not normal URL-routed or hydrated locale navigation. I did not find a hidden default-mode behavior change.

## Checks performed

- `pnpm exec vitest run src/bundler-plugins/vite.test.ts src/compiler/compile-project.test.ts`: 81 passed, 4 skipped. This includes the real Vite build/chunk test and compiler metadata tests.
- `pnpm exec tsc --noEmit`: passed.
- Actual Vite 6.4.1 cold build using the public plugin path and a fresh generated output directory: passed after the splitter `buildStart` hook was marked sequential. Before that fix, the cold build reproduced a metadata-read race because Rollup ran the compiler and splitter hooks concurrently.
- Actual Vite 6 dev-server request: the generated message import resolved to the split facade and HTML contained the preload entry.
- Actual Vite 6 `ssrLoadModule`: remained on the ordinary generated graph; synchronous messages returned English and then German after changing the SSR runtime locale.
- Vite 8.1.4 build/chunk path: covered by the passing integration test above.
- Executable Node ESM probe over the plugin's emitted virtual root/core/loader modules: startup message, `en → de → en`, explicit locale after `await loadLocale`, markup `.parts()`, regional fallback, custom getter preload, and custom setter preload all returned expected outputs. The custom override probe produced `Hello → Hallo` for the getter and `Hallo → Hello` for the setter.

## Multi-turn API experience

**Turn 1 — “Integrate locale splitting without changing message calls.”** I read the public compiling-messages docs, added `experimentalClientLocaleSplit: true` to the existing `paraglideVitePlugin` configuration, set `build.target: "es2022"`, and left normal `m.message()` calls unchanged. This path is discoverable and the option name signals its experimental scope. The required target is easy to miss if someone copies an old plugin config, but the build fails with a direct error and the docs now show a complete config.

**Turn 2 — “Switch locales and use an explicit locale.”** The documented workflow was clear: `await loadLocale("de")`, then call a message with `{ locale: "de" }`; for in-place switching, `await setLocale("de", { reload: false })`. I exercised German and English switching plus explicit override against the generated facade. The language choice remained synchronous at each message call; loading is the explicit async boundary.

**Turn 3 — “Use custom locale getter/setter overrides.”** The docs now identify that static imports and the HTML preloader can run before application entry code. I installed a custom getter, awaited `loadLocale(getLocale())`, and observed the expected German output. I then replaced the setter with an async custom setter that awaited `loadLocale(locale)` before updating its selected locale; `await setLocale("en", { reload: false })` returned English output. This guidance is specific enough to prevent the unloaded-locale failure I had reproduced before the documentation change.

## Boundaries

No real browser automation was available, so the switching and override probes executed emitted ESM modules in Node rather than a browser. I did not claim a browser paint or interaction measurement. Vite 4 is unsupported by the declared peer range and was not tested. I did not perform an HMR edit cycle; the metadata invalidation path is present, but neither it nor translation-only HMR was independently exercised here.
