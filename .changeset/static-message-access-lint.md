---
"@inlang/paraglide-js": minor
---

Add an optional ESLint/Oxlint plugin at `@inlang/paraglide-js/eslint`. Enable `paraglide/no-dynamic-message-access` to report runtime indexing, computed destructuring, and whole-catalog spread/rest copies that can defeat tree-shaking. The rule recognizes generated message imports, aliases and local scope, while allowing static message references and application-owned maps. Custom generated module paths can be added with `messageModules`. No runtime, compiler output, or application behavior changes; the rule has no automatic fix because applications must choose their supported messages.
