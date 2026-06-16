---
"@inlang/paraglide-js": minor
---

Emit `messages/package.json` with `{ "sideEffects": false }` for `message-modules` output, declaring the generated message modules side-effect-free.

This lets bundlers (notably Vite 8 / Rolldown) drop unused re-exports from the `m` barrel per entry, instead of bundling every message used anywhere in the app into one shared chunk that every entry downloads. Without it, per-page JS scales with the union of all messages used across the app rather than with the messages a given route actually uses.

The declaration is scoped to `messages/`, so `runtime.js` (which has real side effects) is unaffected.

See https://github.com/opral/paraglide-js/issues/668
