# Open WebUI locale-split API evaluation

Evaluator: GPT-6 Luna, extra-high reasoning. Date: 2026-10-12. This is a two-turn developer-task simulation using public compiler APIs and a separate executable scratch app; it is not a customer usability study.

## Turn 1: integrate split output and preserve the existing key

Task: add client locale splitting while preserving Open WebUI's existing `localStorage` key, `locale`.

I used the current package checkout at `paraglide-client-split-current-api` commit `6997d020813d76f087d585110e62cd54891726e0`, imported `paraglideVitePlugin` from its built public `dist/index.js`, and configured:

```js
paraglideVitePlugin({
  project: "./project.inlang",
  outdir: "./src/paraglide",
  outputStructure: "locale-modules",
  strategy: ["localStorage", "baseLocale"],
  localStorageKey: "locale",
  experimentalClientLocaleSplit: true,
});

build: { target: "es2022", outDir: "dist", emptyOutDir: true }
```

The first no-target attempt had produced the explicit-target diagnostic; adding `build.target: "es2022"` made the fresh Vite build complete. The successful build used Vite 8.1.4 and emitted separate `en-US` and `fr-FR` locale chunks plus the core and preload chunks. I needed no compiler-private API or message-call rewrite. The required target is easy to apply once the diagnostic is seen, but it should be visible before the first build; the docs now include it.

## Turn 2: switch without navigation and call an explicit locale

Task: confirm an `en-US → fr-FR → en-US` style in-place behavior and render an explicit locale while keeping the current page locale unchanged.

I exercised the public API in a Playwright browser against the production Vite output. The isolated HTML fixture preserves a pre-seeded locale and only supplies French as a default if storage is empty. With `locale=fr-FR`, startup rendered `fr-FR|Bonjour|Connexion`. Calling `await setLocale("en-US", { reload: false })`, then rerendering through the app-owned function, showed `en-US|Hello|Sign in` and updated storage to `en-US`; switching back restored French. There was one document request total, the initial navigation. The probe updates its own text and `<html lang>` because the runtime's `reload: false` mode does not rerender or update document metadata.

In a fresh English context, before preload the page rendered `en-US|Hello|Sign in`. `await loadLocale("fr-FR")` caused exactly one request for the French locale module. A subsequent synchronous `m.greeting({}, { locale: "fr-FR" })` returned `Bonjour` while rendered text, active locale, and storage remained English. No page errors occurred. The transcript records startup values, switch results, module request, and errors in `public-api-probe.json`.

The first run of this second-context test failed because my scratch `index.html` unconditionally set `locale=fr-FR`, overriding the explicitly seeded English context. I corrected only the ignored fixture to honor an existing storage value, rebuilt, and reran successfully. This was a test-harness defect, not a compiler defect.

## Product/API boundaries observed

The API and documentation make the async boundary discoverable: normal message calls stay synchronous; explicit locale calls require a preceding `loadLocale(locale)`; `setLocale(..., { reload: false })` is a special browser-only path and leaves rerendering and document metadata to the application. The scratch behavior verified those statements. This probe covers a tiny static Vite app with two locales; the Open WebUI production route itself was tested with query navigation, not in-place switching.

The full corrected route adapter and same-scope control results are documented separately in `luna-openwebui-review.md`. Their main performance caveat is manual route scoping: the 106-key i18next control reduces native route bytes substantially, leaving a 4.43% byte difference for Paraglide in a one-pair smoke.

## Reproduction

Run the build from the scratch app root, then execute the browser probe:

```sh
cd /root/repos-iii/paraglide-client-split-current-api/.real-apps/openwebui-luna-ax-final
node /root/repos-iii/paraglide-client-split-current-api/node_modules/vite/bin/vite.js build --config vite.config.js
OUTPUT_JSON=/root/repos-iii/paraglide-luna-ntfy-review/benchmark/real-apps/results/luna-openwebui-public-api-probe.json \
  node verify-public-api.mjs
```

The scratch app and transcript are ignored local artifacts:

- `/root/repos-iii/paraglide-client-split-current-api/.real-apps/openwebui-luna-ax-final`
- `benchmark/real-apps/results/luna-openwebui-public-api-probe.json`
