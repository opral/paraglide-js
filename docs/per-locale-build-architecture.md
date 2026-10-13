# Per-locale build architecture

`experimentalPerLocaleBuild: true` uses one architecture: locale-specific
source modules compiled into independent Vite 8+ Rolldown environments.

## Ownership boundary

Paraglide owns:

- generated message and runtime source;
- the locale build plan;
- locale environment names and output directories; and
- an observational manifest derived from native Rolldown output.

Vite owns:

- module resolution and tree-shaking;
- chunks, hashes, CSS, assets, and dynamic imports;
- minification and source maps; and
- `renderBuiltUrl` and output naming.

Paraglide does not inspect or rewrite completed chunks, framework manifests, or
renderer internals.

## Build pipeline

1. The compiler emits a `locale-modules` message layout by default, or the
   explicitly selected `message-modules` layout.
2. A serializable build plan maps each locale to a Vite-safe environment name,
   a stable output directory, and the static locale definition.
3. Vite builds each locale as an independent client environment.
4. Rolldown tree-shakes unselected locale modules through its normal pipeline.
5. Paraglide reads the returned `RolldownOutput`, validates graph closure, and
   writes `paraglide-vite-locales.json`.

Separate environments are important. Multiple locale entries in one Rolldown
graph could still share a chunk containing more than one locale. Independent
environments cannot create cross-locale shared chunks.

With `locale-modules`, the common message dispatcher contains locale module
references but no translated values. With `message-modules`, each message has
its own module and inactive locale branches are tree-shaken.
Generated message-preview comments are omitted from specialized builds. With
`locale-modules`, source maps exclude other locale modules. With
`message-modules`, source maps can contain the original inactive locale branches;
disable source maps or keep them private when deploying these graphs.

## Message modules and lazy pages

To let Vite keep page-specific messages with their lazy page, opt in to
`message-modules` and import the generated physical message modules directly:

```js
// vite.config.js
paraglideVitePlugin({
	project: "./project.inlang",
	outdir: "./src/paraglide",
	experimentalPerLocaleBuild: true,
	outputStructure: "message-modules",
});

// src/lazy-page.js
import { greeting } from "./paraglide/messages/greeting.js";
```

`outputStructure` can also be set in `project.inlang/paraglide.config.js`.
An explicit plugin option takes precedence; when neither sets a layout,
per-locale builds use `locale-modules`.

Run the application build through Vite's builder so the locale orchestrator runs:

```js
// build-app.mjs (run with node build-app.mjs)
import { createBuilder } from "vite";
const builder = await createBuilder();
await builder.buildApp();
```

Message-format paths resolve from the directory containing `project.inlang`.
For `pathPattern: "./messages/{locale}.json"`, place `messages/` beside
`project.inlang/`.

Use static imports for known messages. Dynamic lookup through the complete
message namespace can retain the full catalog; changing the output layout alone
does not guarantee page-specific payloads.

Each emitted graph has a fixed locale. Deployment must select the matching HTML
and asset graph, and changing locale requires full-document navigation to the
other graph. Calling `setLocale` cannot switch an already loaded graph.

## Manifest

Every locale record contains:

- its Vite environment and output directory;
- native entry chunks;
- emitted chunks and assets with byte sizes;
- static and dynamic internal edges; and
- intentionally externalized static and dynamic imports.

Internal edges must resolve to a file in the same locale graph. External edges
are recorded separately rather than treated as missing output.

The manifest describes Rolldown-emitted files. Static files copied from
Vite's `publicDir` remain ordinary Vite public assets and are not synthesized
into the module graph.

## Failure and cleanup behavior

- Vite must be Rolldown-powered Vite 8 or newer.
- Paraglide owns `builder.buildApp`; another orchestrator is rejected.
- Generated environment names cannot collide with application environments.
- Output directories must remain project-relative.
- The prior locale namespace and manifest are removed before building.
- Locale environments build sequentially to avoid generated-source races.
- The manifest is written only after every locale environment succeeds.
- Watch-mode Rolldown output is currently rejected.

## Framework boundary

This architecture intentionally stops at Vite's public boundary. TanStack
Start, SvelteKit, or another framework may own `builder.buildApp` and server
rendering. Paraglide will not regain compatibility by patching their emitted
files.

Framework support requires public cooperation:

1. a hook for requesting one client variant per locale;
2. a returned entry/asset graph or equivalent public identifier; and
3. a render/prerender hook for selecting that graph for a locale.

Until such APIs exist, the Vite backend works only where Paraglide can own the
application build orchestration directly.
