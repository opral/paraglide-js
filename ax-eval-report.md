# Per-locale build AX evaluation

Date: 2026-07-24

> [!NOTE]
> The framework-output implementation evaluated below was subsequently
> removed. Its findings demonstrated the maintenance cost of tracking private
> renderer and output shapes and motivated the Vite-only hard cut documented
> under Architecture follow-up.

## Scope

Three agents evaluated the expanded experimental per-locale build support:

1. TanStack Start 1.168.32 with a `/docs` Vite base.
2. SvelteKit 2.70.1 with `appDir: "kit-assets"`, `paths.base: "/docs"`,
   server router resolution, and SSR.
3. Global, route-specific, and excluded locale strategies on localized routes.

Two fresh judge agents independently checked the reported behavior and fixes.

## Method note

This was an adapted ax-eval rather than a score-comparable canonical run. The
Codex runtime permits four concurrent agents, not the skill's default cohort
of ten, and does not expose Claude JSONL session logs or the pinned
`claude-opus-4-7` configuration. Consequently, deterministic duration,
tool-call, interruption, and error scores were not fabricated. The evaluation
instead preserves reproducible findings, fixture results, and independent
judge outcomes below.

## Findings

### 1. TanStack pathname base required a base-aware router rewrite

The per-locale manifest, output files, imports, SSR asset selection, translated
routes, and canonical redirects worked with `/docs`. The evaluator found that
TanStack removes the deployment base before invoking router `rewrite`, so the
root-hosting example did not compose with base-prefixed Paraglide URL patterns.

Historical resolution: the TanStack guide includes a base-aware adapter that restores
the deployment base for `localizeUrl`/`deLocalizeUrl`, then removes it from the
URL returned to TanStack Router.

Judge: **PASS** on Vite 8.1.5 and TanStack Start 1.168.32.

### 2. SvelteKit server routing serialized canonical node imports

With server router resolution, SvelteKit generates route node imports in
`server_routing.js`, separately from its normal render-path asset prefixing.
German SSR could therefore serialize canonical node URLs while its bootstrap
and content were localized.

Historical resolution in the removed prototype: server-resolved client imports
passed through the locale asset mapper. Server-router builds failed closed
unless both tested SvelteKit renderer integration points were patched.

Judge: **PASS** on Vite 8.1.4 and SvelteKit 2.70.1 with a custom app directory,
`/docs` base, server routing, English/German SSR, localized imports, Link
headers, manifest entries, and output files.

### 3. Localized URLs bypassed canonical route strategies

`/de/dashboard` did not match a cookie-first `/dashboard` rule, and
`/de/api/data` could bypass an excluded `/api` rule because matching only used
the public localized URL.

Resolution: rules are checked against the public URL and its fully
delocalized URL. This uses Paraglide's URL-pattern mapping rather than assuming
that the locale is always the first path segment.

Judge: **PASS**. The reproduction now renders `/de/dashboard` with the
cookie-selected English locale and leaves excluded `/de/api/data` untouched.

## Verification

- Current repository suite after the hard cut: 401 passed, 7 skipped.
- Native Vite fixtures verify independent English/German graphs, source-map
  isolation, CSS, dynamic and external imports, custom output names,
  `renderBuiltUrl`, stale-output cleanup, byte counts, and graph closure.
- The ordinary TanStack Start and SvelteKit example production builds pass
  without private per-locale adapters.
- The package build and generated API documentation pass.

## Remaining boundaries and risks

- The evaluated SvelteKit and TanStack output adapters are no longer shipped.
- The Vite-native backend cannot compose with another `builder.buildApp`
  owner.
- Framework SSR selection needs public client-variant and render-selection
  hooks.
- Watch-mode Rolldown output remains unsupported.

## Architecture follow-up

The final implementation makes a hard cut: `experimentalPerLocaleBuild: true`
now has one Vite 8+ environment architecture. The Oxc specialization pass,
framework detection, private SvelteKit renderer transforms, generated
TanStack server adapter, and framework-specific manifests were removed.

- The compiler emits locale source modules before bundling.
- Vite builds one independent Rolldown environment per locale.
- Paraglide observes native outputs and emits
  `paraglide-vite-locales.json`; it does not rewrite chunks.
- Unminified builds, source maps, CSS, dynamic imports, custom output naming,
  `renderBuiltUrl`, and external imports were exercised.
- Real compiled English and German messages were checked across executable
  chunks and embedded source-map content. Neither graph contained the other
  locale's translated value.
- A generated English message preview in the shared dispatcher was found to
  leak into German source maps and removed.
- Stale locale directories are cleared before building, and the manifest is
  written only after every locale environment succeeds.

The backend intentionally stops at Vite's public boundary. TanStack Start or
SvelteKit adoption needs a public framework hook for building client variants
and selecting the correct returned graph during render/prerender.
