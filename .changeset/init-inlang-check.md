---
"@inlang/paraglide-js": minor
---

`paraglide-js init` sets up translation checks.

- New projects use `@inlang/plugin-message-format` 4.5.0 and `@inlang/plugin-m-function-matcher` 2.3.0.
- `init` adds `@inlang/cli` ^3.4.0 to the devDependencies (unless it's there) and a `check:i18n` script that runs `inlang check --project ./project.inlang` (unless a script of that name exists). It warns if an existing `@inlang/cli` is older than 3.4.0, which has no `inlang check`.
- At the end, `init` prints a localization section you can add to your `AGENTS.md`, with your project path, message files and output directory. It doesn't write `AGENTS.md`.
