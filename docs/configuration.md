---
title: Configuration File
description: Centralize Paraglide JS options in a paraglide.config.js/ts file inside your inlang project, shared by the CLI and all bundler plugins.
---

# Configuration File

Paraglide JS can read its options from a configuration file that lives
**inside your inlang project directory** (conventionally `project.inlang/`),
next to `settings.json` and your messages. The file is used by the CLI and
by all bundler plugins, so you can define your setup once instead of
repeating it in flags and plugin calls.

## File name & location

Paraglide looks for one of the following files inside the project directory,
in this order:

1. `paraglide.config.js`
2. `paraglide.config.mjs`
3. `paraglide.config.ts`
4. `paraglide.config.cjs`

The project directory itself comes from:

- the CLI: the `--project` flag. When omitted, Paraglide uses the
  conventional `./project.inlang` relative to the current working directory
  and logs a notice saying so.
- bundler plugins: the required `project` option — for example
  `paraglideVitePlugin({ project: "./project.inlang" })`. Relative paths
  are resolved against the tool's project root (Vite's `root`,
  webpack/rspack's `context`, otherwise the current working directory).
  There is no implicit default: point the plugin at your project.

If no config file exists inside the project directory, everything keeps
working via command line flags, plugin options, and built-in defaults.

Because the config lives inside the project it configures, it cannot set
the `project` option itself. TypeScript rejects the key at compile time; in
plain-JS configs it shows up as an unknown option.

## Example

```ts
// project.inlang/paraglide.config.ts
import { defineConfig } from "@inlang/paraglide-js";

export default defineConfig({
	outdir: "./src/paraglide",
	strategy: ["cookie", "preferredLanguage", "baseLocale"],
	urlPatterns: [
		{
			pattern: "/",
			localized: [["en", "/"]],
		},
		{
			pattern: "/:path(.*)?",
			localized: [
				["en", "/en/:path(.*)?"],
				["de", "/de/:path(.*)?"],
			],
		},
	],
});
```

The config file supports every [compiler option](./compiler-options) except
internal options like `fs` and the `project` path (the config lives inside
the project, so it cannot point at one). One exception: `cleanOutdir` is
accepted but ignored — the CLI and bundler plugins always preserve the
output directory so incremental compilation stays fast.

Relative paths like `outdir` are resolved against your working directory or
the tool's project root — exactly like the same value passed as a flag or
plugin option. Note that `additionalFiles` values are file contents
(`{ "output-file.js": "…" }`), not paths.

> [!TIP]
> The `defineConfig` helper is optional — it only provides type inference
> and autocompletion. A plain `export default { ... }` works as well.

## Option precedence

Options are resolved with the following precedence, from highest to lowest:

1. **Command line flags** (e.g. `--outdir`) and **explicit plugin options**
   (e.g. `paraglideVitePlugin({ outdir })`)
2. **Config file** values
3. **Built-in defaults** (`./project.inlang`, `./src/paraglide`, …)

An option that is not passed on the command line or to the plugin does not
override the config file.

## Watch-mode behavior

The CLI (`compile --watch`) and all bundler plugins reload the config when
the active config file changes on disk. Renaming between the supported file
names (e.g. `.js` → `.ts`) switches to the new file, and creating a config
file while watching is picked up as well.

When things go wrong:

- **Invalid config** — compilation is skipped and the error is reported.
  Watch modes keep serving the previously compiled output; production
  builds fail loudly.
- **Deleted config** — Paraglide falls back to the built-in defaults, same
  as if there had never been a config. Recreating any config file is picked
  up again.

One limitation: esbuild does not support registering additional watch
files, so config changes require an esbuild process restart.

## Usage with the CLI

```bash
# uses ./project.inlang by default
npx @inlang/paraglide-js compile

# uses a different project directory (and its config file)
npx @inlang/paraglide-js compile --project ./packages/app/project.inlang
```

## Usage with bundler plugins

All other options are optional — anything you don't pass is read from the
config file:

```ts
// vite.config.ts
import { paraglideVitePlugin } from "@inlang/paraglide-js";

export default {
	plugins: [
		// project is required; everything else comes from its config file
		paraglideVitePlugin({ project: "./project.inlang" }),
	],
};
```

Explicit options remain useful for per-plugin overrides:

```ts
paraglideVitePlugin({
	outdir: "./src/paraglide-custom", // wins over the config file
});
```

## Validation

- Unknown keys produce a warning so typos are caught early.
- Values with the wrong type fail with an error that names the offending key.
