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

For all available options, see the [Compiler Options Reference](./compiler-options). Options can also be centralized in a `paraglide.config.js/ts` file that is used by the CLI and all bundler plugins — see [Configuration File](./configuration).

## Runtime diagnostics

The generated runtime uses the bundler-independent `isDevelopment` flag for development-only diagnostics, such as warning when a locale override cannot change a locale-specialized build. Vite sets this flag from its resolved development/production mode. Other bundler plugins default to `NODE_ENV !== "production"`. Explicit plugin or project configuration takes precedence.

Standalone compilation enables diagnostics by default. Set the compiler option `isDevelopment: "false"`, or pass `--is-development false` to the CLI, to remove these diagnostics from production bundles. Like `isServer`, the option accepts a JavaScript expression as a string; no Vite-specific globals are required.

## Via the Paraglide CLI

> [!TIP]
> For a complete setup guide using CLI compilation with Express, Hono, Fastify, or Elysia, see [Standalone Servers](./standalone-servers). For monorepo setups, see [Monorepo Setup](./monorepo).

The recommended commands below emit `.d.ts` files for reliable editor updates without requiring TypeScript to be installed. Omit `--emit-ts-declarations` to use JavaScript/JSDoc inference instead.

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

#### Stop serving stale translations during development

By default, compilation errors appear in Vite's error overlay and the last
successful output remains available. To return HTTP 500 while translation
compilation or the Paraglide configuration is invalid, enable `devErrorResponse`:

```ts
paraglideVitePlugin({
	project: "./project.inlang",
	devErrorResponse: true,
});
```

This option belongs to the Vite plugin, not `paraglide.config`. It affects
requests that reach Vite's development middleware. Responses contain the
diagnostic as plain text and use `Cache-Control: no-store`. Connected clients
still receive the error overlay. Requests resume after a successful compilation;
a page opened directly on the plain-text error response needs a manual reload.
Production builds keep their existing error behavior.

Closing the Vite server waits for compilations already queued by the watcher.
If compilation is still running when closing starts, its cache entries are
discarded so the next start rebuilds from current inputs.
Writes whose events have not reached the plugin before shutdown are picked up
by the next build or development-server start.

#### Experimental per-locale builds

Per-locale builds are the recommended approach for shipping only the active
locale's messages. Paraglide v3 removes `experimentalMiddlewareLocaleSplitting`.
Remove that option from your compiler or Vite configuration and use
`experimentalPerLocaleBuild` for supported Vite applications, as shown below.
The middleware no longer injects message functions into HTML. Check the build
and deployment constraints in this section before migrating.

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

The default layout is `locale-modules`. For applications with lazy pages,
select `message-modules` so Vite can keep each page's messages with that page:

```ts
paraglideVitePlugin({
	project: "./project.inlang",
	outdir: "./src/paraglide",
	experimentalPerLocaleBuild: true,
	outputStructure: "message-modules",
});
```

Keep message references static, such as `m.greeting()`. Dynamic indexing through
the complete message namespace can retain the whole catalog. Individual source
modules provide build-time granularity; Vite bundles them into page and shared
chunks rather than making a browser request for each message. With message
modules, source maps can contain inactive locale branches; disable public source
maps or keep them private.

Locale switching still requires full-document navigation. The server, deployment adapter, or static
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

Paraglide compiles to JavaScript with JSDoc type annotations. The recommended configurations above also emit `.d.ts` files so editors reliably refresh message keys when generated files change. Declarations are generated directly without requiring TypeScript to be installed.

If you disable declaration emission, enable TypeScript support for the generated JSDoc types with `allowJs` in your `tsconfig.json`:

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

Declarations are generated directly from message metadata and runtime declaration templates. The generated declarations do not depend on the TypeScript version installed in your project. The CLI emits declarations by default, and init enables them in generated integrations without modifying your tsconfig. Programmatic compiler calls and manually configured bundler plugins retain `emitTsDeclarations: false` as their default. Set `emitTsDeclarations: false` (or use `--no-emit-ts-declarations`) and `allowJs: true` to use JSDoc-based types.

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

Large projects can reduce file creation and repeated generated code by grouping messages:

```ts
await compile({
	project: "./project.inlang",
	outdir: "./src/paraglide",
	outputStructure: "message-modules",
	messageModuleSize: 512,
	emitTsDeclarations: true,
});
```

The CLI exposes the same option:

```sh
paraglide-js compile --message-module-size 512 --emit-ts-declarations
```

`messageModuleSize` defaults to `1`, preserving the existing per-message files.
Higher values write groups to `messages/_shard_*.js` and matching declarations.
Continue importing messages through `messages.js`; imports of individual generated
message files must be updated when enabling grouping. Individual unused messages
can still be removed by a bundler. Grouping requires `message-modules` and is
currently unavailable for locale-specialized builds. Bundler integrations can set
these same compiler options; specify `outputStructure` explicitly because development
mode can otherwise select locale modules.

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

## Migrating to Paraglide JS 3

Paraglide JS 3 removes the `additionalFiles` compiler option. Remove this option from your compiler calls, bundler plugin options, and `paraglide.config.*` files.

Keep framework helpers and message re-export wrappers in your application source, outside the generated output directory. For example, a wrapper in `src/messages.js` can re-export generated messages:

```js
export * from "./paraglide/messages.js";
```

Use your own build tooling for extra assets, metadata files, and source maps. Paraglide owns the generated output directory and may remove files placed there during compilation. With `emitTsDeclarations: true`, Paraglide continues to emit declarations for its generated JavaScript.

Paraglide JS 3 uses the SDK catalog API directly; older SDKs without `@inlang/sdk/catalog` are no longer supported.
