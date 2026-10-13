---
"@inlang/paraglide-js": minor
---

Add an optional ESLint/Oxlint plugin at `@inlang/paraglide-js/eslint`. Enable `paraglide/no-dynamic-message-access` to report runtime indexing, computed destructuring, and whole-catalog spread/rest copies that can defeat tree-shaking. The rule recognizes generated message imports, aliases and local scope, while allowing static message references and application-owned maps. Custom generated module paths can be added with `messageModules`. No runtime, compiler output, or application behavior changes; the rule has no automatic fix because applications must choose their supported messages.


Add optional lint setup to `paraglide-js init` with `--lint eslint|oxlint|none`, preserving existing lint configs via a dedicated `lint:i18n` script. Add `--yes`/`--non-interactive`, explicit project/output paths, and optional setup flags for unattended use. Closed input without an unattended flag fails before writes; headless mode skips optional editor/machine-translation prompts, protects dirty git trees unless explicitly allowed, reuses existing projects, preserves TypeScript config comments, and returns nonzero on setup/compile failures. No dependencies are installed automatically.
