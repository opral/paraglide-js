---
title: Compiling Messages
description: How to compile Paraglide messages - CLI, bundler plugins, and programmatic compilation.
---

# Compiling Messages

There are three ways to invoke the Paraglide JS compiler:

1. Via the Paraglide CLI
2. Via a bundler plugin
3. Programmatically

> [!TIP]
> **Bundler plugins are recommended** because they automatically recompile when translation files change, integrate with your existing build process, and require no separate watch command. CLI compilation is better suited for CI/CD pipelines or projects without a bundler.

For all available options, see the [Compiler Options Reference](./compiler-options).

## Via the Paraglide CLI

> [!TIP]
> For a complete setup guide using CLI compilation with Express, Hono, Fastify, or Elysia, see [Standalone Servers](./standalone-servers). For monorepo setups, see [Monorepo Setup](./monorepo).

The recommended commands below emit `.d.ts` files for reliable editor updates and require TypeScript 5.6 or newer. Omit `--emit-ts-declarations` to use JavaScript/JSDoc inference instead.

To compile your messages via the CLI, run the following command:

```bash
npx @inlang/paraglide-js compile --project ./project.inlang --outdir ./src/paraglide --emit-ts-declarations
```

To watch files and recompile on change, add the `--watch` flag:

```bash
npx @inlang/paraglide-js compile --project ./project.inlang --outdir ./src/paraglide --emit-ts-declarations --watch
```

Use `--help` to see all available options:

```bash
npx @inlang/paraglide-js compile --help
```

## Via a bundler plugin

All bundler plugins are exported from `@inlang/paraglide-js`:

```ts
import {
	paraglideVitePlugin,
	paraglideWebpackPlugin,
	paraglideRollupPlugin,
	paraglideRspackPlugin,
	paraglideRolldownPlugin,
	paraglideEsbuildPlugin,
	// ... and more plugins supported by unplugin
} from "@inlang/paraglide-js";
```

See [unplugin](https://unplugin.unjs.io/) for the full list of supported bundlers.

### Vite

> [!TIP]
> **Vite is the ideal bundler for Paraglide.** Vite's built-in tree-shaking
> automatically eliminates unused messages, and HMR gives you instant feedback
> when editing translations. Setup is just one plugin—no extra configuration
> needed.

```ts
import { defineConfig } from "vite";
import { paraglideVitePlugin } from "@inlang/paraglide-js";

export default defineConfig({
	plugins: [
		paraglideVitePlugin({
			project: "./project.inlang",
			outdir: "./src/paraglide",
			emitTsDeclarations: true,
		}),
	],
});
```

#### Experimental per-locale builds

The Vite 8+ backend builds one independent Rolldown client environment per
locale:

```ts
paraglideVitePlugin({
	project: "./project.inlang",
	outdir: "./src/paraglide",
	experimentalPerLocaleBuild: true,
});
```

Paraglide generates one source module per locale before Vite starts bundling.
Each environment then runs the normal Vite/Rolldown pipeline. Paraglide does
not parse, rename, minify, or rewrite emitted chunks. Consequently,
`build.minify: false`, source maps, CSS, dynamic imports, custom chunk names,
and normal Vite asset handling stay under Vite's control. Source maps were
explicitly tested to ensure they do not embed another locale's translations.

Outputs are written to
`<build.outDir>/__paraglide/<stable-locale-id>/`. The top-level
`paraglide-vite-locales.json` records the Vite and Rolldown versions, each
environment and directory, native entry chunks, file byte sizes, static
imports, and dynamic imports. The build verifies that every recorded internal
import is present in the same locale graph.

This backend deliberately owns Vite's `builder.buildApp` hook and fails if
another orchestrator is installed. It therefore works for Vite applications
whose client build Vite owns directly. It does not inspect a framework's
server output or patch framework manifests. A framework integration requires
a public API through which the framework asks for locale client variants and
selects a returned graph during rendering.

The generated Paraglide layout is `locale-modules`; explicitly selecting
`message-modules` is rejected for this backend. Locale switching still
requires full-document navigation. The server, deployment adapter, or static
hosting layout is responsible for selecting the directory named by the
manifest. For directly opening each emitted HTML tree, use a relative Vite
`base` such as `"./"`.

TanStack Start and SvelteKit currently own their Vite application build and
server rendering. The backend fails instead of inspecting their output. They
need public client-variant build and render-selection hooks before this option
can compose with them. See the
[per-locale build architecture](./per-locale-build-architecture.md).

### Webpack

```js
// webpack.config.js
const { paraglideWebpackPlugin } = require("@inlang/paraglide-js");

module.exports = {
	plugins: [
		paraglideWebpackPlugin({
			project: "./project.inlang",
			outdir: "./src/paraglide",
			emitTsDeclarations: true,
		}),
	],
};
```

### Rollup

```js
// rollup.config.js
import { paraglideRollupPlugin } from "@inlang/paraglide-js";

export default {
	plugins: [
		paraglideRollupPlugin({
			project: "./project.inlang",
			outdir: "./src/paraglide",
			emitTsDeclarations: true,
		}),
	],
};
```

## TypeScript Configuration

Paraglide compiles to JavaScript with JSDoc type annotations. The recommended configurations above also emit `.d.ts` files so editors reliably refresh message keys when generated files change. Declaration emission requires TypeScript 5.6 or newer.

If you disable declaration emission for faster compilation, enable TypeScript support for the generated JSDoc types with `allowJs` in your `tsconfig.json`:

```json
{
	"compilerOptions": {
		"allowJs": true
	}
}
```

### Emitting `.d.ts` declarations

Emit TypeScript declaration files when your project doesn't support `allowJs` (e.g., publishing a library), or when your editor reports newly added message functions as missing until its language server restarts:

```bash
npx @inlang/paraglide-js compile --project ./project.inlang --outdir ./src/paraglide --emit-ts-declarations
```

Or via bundler plugin / programmatic API:

```ts
paraglideVitePlugin({
	project: "./project.inlang",
	outdir: "./src/paraglide",
	emitTsDeclarations: true,
});
```

> [!NOTE]
> Emitting declarations requires TypeScript 5.6 or newer and is slower than JSDoc-based types. The framework setup examples enable it for reliable language-server updates. Set `emitTsDeclarations: false` (or use `--no-emit-ts-declarations`) and `allowJs: true` when faster compilation matters more in your project.

> [!NOTE]
> With TypeScript 5 and 6, declarations are generated with the in-process compiler API. TypeScript 7+ no longer provides that API, so Paraglide invokes its `tsc` CLI in a child process instead. The output is semantically equivalent, but differs cosmetically between the two (quote style, declaration ordering, `export declare const` vs `export const`) — expect `.d.ts` churn when switching TypeScript majors.

## Generated Output

The compiler generates the following file structure in your `outdir`:

```
paraglide/
  messages/
    hello_world/        # One folder per message (default structure)
      index.js
      en.js
      de.js
  messages.js           # Re-exports all message functions
  runtime.js            # Locale management (getLocale, setLocale, etc.)
  server.js             # Server middleware (paraglideMiddleware)
  .gitignore            # Ignores generated files
  README.md             # Documentation for LLMs
```

**Key files:**

| File          | Purpose                                                                  |
| ------------- | ------------------------------------------------------------------------ |
| `messages.js` | Import message functions: `import * as m from "./paraglide/messages.js"` |
| `runtime.js`  | Locale utilities: `getLocale()`, `setLocale()`, `locales`, `baseLocale`  |
| `server.js`   | Server middleware: `paraglideMiddleware()`                               |

The `outputStructure` option controls how messages are organized. See [Compiler Options](./compiler-options) for details.

## Programmatically

The Paraglide compiler can be invoked programmatically via the `compile` function.

```ts
import { compile } from "@inlang/paraglide-js";

await compile({
	project: "./project.inlang",
	outdir: "./src/paraglide",
	emitTsDeclarations: true,
});
```

### Lower-level API

Use `compileProject` when you need control over the output, such as:

- Writing files to a custom directory structure
- Post-processing the generated code
- Integrating with a custom build system

This requires the [`@inlang/sdk`](https://inlang.com/docs/write-tool/) package:

```bash
npm install @inlang/sdk
```

```ts
import { compileProject } from "@inlang/paraglide-js";
import { loadProjectFromDirectory } from "@inlang/sdk";
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

const inlangProject = await loadProjectFromDirectory({
	path: "./project.inlang",
});

const output = await compileProject({
	project: inlangProject,
});

// Write files to a custom location
const outdir = "./custom/paraglide";
await mkdir(outdir, { recursive: true });

for (const [filename, content] of Object.entries(output)) {
	await writeFile(join(outdir, filename), content);
}
```
