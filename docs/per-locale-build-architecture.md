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

1. The compiler emits a `locale-modules` message layout.
2. A serializable build plan maps each locale to a Vite-safe environment name,
   a stable output directory, and the static locale definition.
3. Vite builds each locale as an independent client environment.
4. Rolldown tree-shakes unselected locale modules through its normal pipeline.
5. Paraglide reads the returned `RolldownOutput`, validates graph closure, and
   writes `paraglide-vite-locales.json`.

Separate environments are important. Multiple locale entries in one Rolldown
graph could still share a chunk containing more than one locale. Independent
environments cannot create cross-locale shared chunks.

The common message dispatcher contains locale module references but no
translated values. Inactive locale modules never enter the environment graph.
Generated message-preview comments are also omitted from specialized builds so
source maps cannot embed another locale's translation.

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
