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

To compile your messages via the CLI, run the following command:

```bash
npx @inlang/paraglide-js compile --project ./project.inlang --outdir ./src/paraglide
```

To watch files and recompile on change, add the `--watch` flag:

```bash
npx @inlang/paraglide-js compile --project ./project.inlang --outdir ./src/paraglide --watch
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
> **Vite is the ideal bundler for Paraglide.** Vite's built-in tree-shaking (via Rollup) automatically eliminates unused messages, and HMR gives you instant feedback when editing translations. Setup is just one plugin—no extra configuration needed.

```ts
import { defineConfig } from "vite";
import { paraglideVitePlugin } from "@inlang/paraglide-js";

export default defineConfig({
	plugins: [
		paraglideVitePlugin({
			project: "./project.inlang",
			outdir: "./src/paraglide",
		}),
	],
});
```

### Webpack

```js
// webpack.config.js
const { paraglideWebpackPlugin } = require("@inlang/paraglide-js");

module.exports = {
	plugins: [
		paraglideWebpackPlugin({
			project: "./project.inlang",
			outdir: "./src/paraglide",
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
		}),
	],
};
```

## TypeScript Configuration

Paraglide compiles to JavaScript with JSDoc type annotations, providing full type safety without a separate build step. To enable TypeScript support for JSDoc types, add `allowJs` to your `tsconfig.json`:

```json
{
	"compilerOptions": {
		"allowJs": true
	}
}
```

### Emitting `.d.ts` declarations

If your project doesn't support `allowJs` (e.g., publishing a library), you can emit TypeScript declaration files instead:

```bash
npx @inlang/paraglide-js compile --project ./project.inlang --outdir ./src/paraglide --emitTsDeclarations
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
> Emitting declarations requires the `typescript` package and is slower than JSDoc-based types. Use `allowJs: true` when possible for faster compilation.

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

| File | Purpose |
|------|---------|
| `messages.js` | Import message functions: `import * as m from "./paraglide/messages.js"` |
| `runtime.js` | Locale utilities: `getLocale()`, `setLocale()`, `locales`, `baseLocale` |
| `server.js` | Server middleware: `paraglideMiddleware()` |

The `outputStructure` option controls how messages are organized. See [Compiler Options](./compiler-options) for details.

## Programmatically

The Paraglide compiler can be invoked programmatically via the `compile` function.

```ts
import { compile } from "@inlang/paraglide-js";

await compile({
	project: "./project.inlang",
	outdir: "./src/paraglide",
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
