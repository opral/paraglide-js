---
"@inlang/paraglide-js": minor
---

Add support for a `paraglide.config.js` (or `.mjs`, `.ts`, `.cjs`)
configuration file inside the inlang project directory.

The CLI and all bundler plugins now pick up compiler options from
`<project>/paraglide.config.*`. The project directory comes from `--project`
or the plugin's `project` option and defaults to the conventional
`./project.inlang` — which means every bundler plugin can now be
instantiated without arguments. Since the config lives inside the project it
configures, it cannot set `project` itself. Explicit flags and plugin
options win over the config file, which wins over the built-in defaults.
Existing setups keep working unchanged.

Also included:

- A new `defineConfig` helper exported from `@inlang/paraglide-js` for type
  inference and autocompletion in config files.
- Watch modes reload when the active config file changes, including renames
  between the supported file names. Deleting all config files falls back to
  the built-in defaults; an invalid config skips the compilation with an
  error — watch modes keep serving the previous output, production builds
  fail loudly. (esbuild does not support config watching.)
- `cleanOutdir` is accepted but ignored: watch integrations always preserve
  the output directory for incremental compilation.
