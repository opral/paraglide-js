---
"@inlang/paraglide-js": minor
---

Emit `messages/package.json` with `{ "type": "module", "sideEffects": false }` for `message-modules` output, declaring the generated message modules side-effect-free.

This lets bundlers (notably Vite 8 / Rolldown) drop unused re-exports from the `m` barrel per entry, instead of bundling every message used anywhere in the app into one shared chunk that every entry downloads. Without it, per-page JS scales with the union of all messages used across the app rather than with the messages a given route actually uses.

The declaration is scoped to `messages/`, so `runtime.js` (which has real side effects) is unaffected. `type: "module"` is included because the package.json creates a new module scope for `messages/`; without it, the generated ESM files would default to CommonJS (a package.json without `type` is CJS in Node, even when the consuming project is `type: "module"`).

See https://github.com/opral/paraglide-js/issues/668
