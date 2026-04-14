---
"@inlang/paraglide-js": minor
---

Add new `paraglide-js compile` CLI flags for compiler options that were
previously only available through the programmatic API or bundler plugins.

You can now:

- enable or disable emitted `.gitignore`, `.prettierignore`, and `README.md`
- explicitly enable or disable emitted `.d.ts` files
- pass a custom `isServer` expression for runtime tree-shaking

These options are forwarded through regular and `--watch` compiles so the CLI
matches the existing compiler behavior more closely.
