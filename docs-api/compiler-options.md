## CompilerOptions

> **CompilerOptions** = `object`

Defined in: [compiler-options.ts:21](https://github.com/opral/paraglide-js/tree/main/src/compiler/compiler-options.ts)

### Properties

#### additionalFiles?

> `optional` **additionalFiles**: `Record`\<`string`, `string`\>

Defined in: [compiler-options.ts:190](https://github.com/opral/paraglide-js/tree/main/src/compiler/compiler-options.ts)

The `additionalFiles` option is an array of paths to additional files that should be copied to the output directory.

##### Example

```diff
await compile({
  project: "./project.inlang",
  outdir: "./src/paraglide",
  additionalFiles: [
+    "my-file.js": "console.log('hello')"
  ]
})
```

The output will look like this:

```diff
  - outdir/
    - messages/
+   - my-file.js
    - messages.js
    - runtime.js
```

#### cleanOutdir?

> `optional` **cleanOutdir**: `boolean`

Defined in: [compiler-options.ts:336](https://github.com/opral/paraglide-js/tree/main/src/compiler/compiler-options.ts)

Whether to clean the output directory before writing the new files.

##### Default

```ts
true
```

#### cookieDomain?

> `optional` **cookieDomain**: `string`

Defined in: [compiler-options.ts:164](https://github.com/opral/paraglide-js/tree/main/src/compiler/compiler-options.ts)

The host to which the cookie will be sent.
If undefined or empty, the domain attribute is omitted from the cookie, scoping it to the exact current domain only (no subdomains).
If specified, the cookie will be available to the specified domain and all its subdomains.

Use this when you need cookies to be shared across subdomains (e.g., between `app.example.com` and `api.example.com`).
The default behavior (no domain) ensures better compatibility with server-side cookies that don't specify a domain attribute.

##### Example

```ts
// Default: exact domain only (compatible with server-side cookies)
cookieDomain: undefined // Cookie: "PARAGLIDE_LOCALE=en; path=/; max-age=34560000"

// Subdomain sharing: available across all subdomains
cookieDomain: "example.com" // Cookie: "PARAGLIDE_LOCALE=en; path=/; max-age=34560000; domain=example.com"
```

##### Default

```ts
"" (no domain attribute, exact domain only)
```

#### cookieMaxAge?

> `optional` **cookieMaxAge**: `number`

Defined in: [compiler-options.ts:144](https://github.com/opral/paraglide-js/tree/main/src/compiler/compiler-options.ts)

The max-age in seconds of the cookie until it expires.

##### Default

```ts
60 * 60 * 24 * 400
```

#### cookieName?

> `optional` **cookieName**: `string`

Defined in: [compiler-options.ts:138](https://github.com/opral/paraglide-js/tree/main/src/compiler/compiler-options.ts)

The name of the cookie to use for the cookie strategy.

##### Default

```ts
'PARAGLIDE_LOCALE'
```

#### disableAsyncLocalStorage?

> `optional` **disableAsyncLocalStorage**: `boolean`

Defined in: [compiler-options.ts:265](https://github.com/opral/paraglide-js/tree/main/src/compiler/compiler-options.ts)

Replaces AsyncLocalStorage with a synchronous implementation.

⚠️ WARNING: This should ONLY be used in serverless environments
like Cloudflare Workers.

Disabling AsyncLocalStorage in traditional server environments
risks cross-request pollution where state from one request could
leak into another concurrent request.

#### emitGitIgnore?

> `optional` **emitGitIgnore**: `boolean`

Defined in: [compiler-options.ts:279](https://github.com/opral/paraglide-js/tree/main/src/compiler/compiler-options.ts)

If `emitGitIgnore` is set to `true` a `.gitignore` file will be emitted in the output directory. Defaults to `true`.

```diff
  - outdir/
    - messages/
+   - .gitignore
    - messages.js
    - runtime.js
```

##### Default

```ts
true
```

#### emitPrettierIgnore?

> `optional` **emitPrettierIgnore**: `boolean`

Defined in: [compiler-options.ts:204](https://github.com/opral/paraglide-js/tree/main/src/compiler/compiler-options.ts)

If `emitPrettierIgnore` is set to `true` a `.prettierignore` file will be emitted in the output directory. Defaults to `true`.

```diff
  - outdir/
    - messages/
+   - .prettierignore
    - messages.js
    - runtime.js
```

##### Default

```ts
true
```

#### emitReadme?

> `optional` **emitReadme**: `boolean`

Defined in: [compiler-options.ts:221](https://github.com/opral/paraglide-js/tree/main/src/compiler/compiler-options.ts)

If `emitReadme` is set to `true` a `README.md` file will be emitted in the output directory. Defaults to `true`.

The README helps LLMs understand the compiled output.
See https://llmstxt.org/ for format guidelines.

```diff
  - outdir/
    - messages/
+   - README.md
    - messages.js
    - runtime.js
```

##### Default

```ts
true
```

#### emitTsDeclarations?

> `optional` **emitTsDeclarations**: `boolean`

Defined in: [compiler-options.ts:244](https://github.com/opral/paraglide-js/tree/main/src/compiler/compiler-options.ts)

Emit `.d.ts` files for the generated output using the TypeScript compiler.

Useful when `allowJs: true` cannot be set in your `tsconfig.json`
(e.g., due to project constraints or conflicting compiler options).

Requires `typescript` to be resolvable in your toolchain.

**Note:** Enabling this option reduces compiler speed because TypeScript
needs to generate declaration files for all output modules.

##### Example

```ts
await compile({
  project: "./project.inlang",
  outdir: "./src/paraglide",
  emitTsDeclarations: true,
});
```

##### Default

```ts
false
```

#### experimentalMiddlewareLocaleSplitting?

> `optional` **experimentalMiddlewareLocaleSplitting**: `boolean`

Defined in: [compiler-options.ts:79](https://github.com/opral/paraglide-js/tree/main/src/compiler/compiler-options.ts)

Whether or not to use experimental middleware locale splitting.

⚠️ This feature is experimental and only works in SSR/SSG environment
  without client-side routing. Do not rely on this feature for production.

This feature is part of the exploration of per locale splitting. The
issue is ongoing and can be followed here [#88](https://github.com/opral/inlang-paraglide-js/issues/88).

- The client bundle will tree-shake all messages (have close to 0kb JS).
- The server middleware will inject the used messages into the HTML.
- The client will re-trieve the messages from the injected HTML.

##### Default

```ts
false
```

#### experimentalStaticLocale?

> `optional` **experimentalStaticLocale**: `string`

Defined in: [compiler-options.ts:132](https://github.com/opral/paraglide-js/tree/main/src/compiler/compiler-options.ts)

Compile-time locale constant used for per-locale tree-shaking.

This is experimental and opt-in. It should be a JavaScript expression
(not a quoted literal) that resolves to a locale or `undefined` at build time.
You can pass a string literal (e.g. `"de"`) for programmatic builds, or an
injected env/define expression for bundler-driven builds.

High-level flow for per-locale builds:

client request (/)
        |
        v
  +----------------------+
  | detect locale        |
  | (cookie/Accept-L)    |
  | pick build prefix    |
  +----------------------+
        | if "de"
        v
   serve dist/de/...  <----> serve dist/en/...
   (HTML + assets)          (HTML + assets)

##### See

https://github.com/opral/paraglide-js/issues/88#issuecomment-3634754638

##### Examples

```ts
// Vite define
  experimentalStaticLocale: "typeof __PARAGLIDE_STATIC_LOCALE__ === 'undefined' ? undefined : __PARAGLIDE_STATIC_LOCALE__"
```

```ts
// Programmatic compile (literal)
  experimentalStaticLocale: '"de"'
```

#### fs?

> `optional` **fs**: `any`

Defined in: [compiler-options.ts:343](https://github.com/opral/paraglide-js/tree/main/src/compiler/compiler-options.ts)

The file system to use. Defaults to `await import('node:fs')`.

Useful for testing the paraglide compiler by mocking the fs.

#### includeEslintDisableComment?

> `optional` **includeEslintDisableComment**: `boolean`

Defined in: [compiler-options.ts:254](https://github.com/opral/paraglide-js/tree/main/src/compiler/compiler-options.ts)

Whether to include an eslint-disable comment at the top of each .js file.

##### Default

```ts
true
```

#### isServer?

> `optional` **isServer**: `string`

Defined in: [compiler-options.ts:98](https://github.com/opral/paraglide-js/tree/main/src/compiler/compiler-options.ts)

Tree-shaking flag if the code is running on the server.

Dependent on the bundler, this flag must be adapted to
enable tree-shaking.

##### Example

```ts
// vite
  isServer: "import.meta.env.SSR"
```

##### Default

```ts
typeof window === "undefined"
```

#### localStorageKey?

> `optional` **localStorageKey**: `string`

Defined in: [compiler-options.ts:85](https://github.com/opral/paraglide-js/tree/main/src/compiler/compiler-options.ts)

The name of the localStorage key to use for the localStorage strategy.

##### Default

```ts
'PARAGLIDE_LOCALE'
```

#### outdir

> **outdir**: `string`

Defined in: [compiler-options.ts:45](https://github.com/opral/paraglide-js/tree/main/src/compiler/compiler-options.ts)

The path to the output directory.

##### Example

```diff
await compile({
  project: "./project.inlang",
+ outdir: "./src/paraglide"
})
```

#### outputStructure?

> `optional` **outputStructure**: `"locale-modules"` \| `"message-modules"`

Defined in: [compiler-options.ts:330](https://github.com/opral/paraglide-js/tree/main/src/compiler/compiler-options.ts)

The `outputStructure` defines how modules are structured in the output.

- `message-modules` - Each module is a message. This is the default.
- `locale-modules` - Each module is a locale.

It is recommended to use `locale-modules` for development and `message-modules` for production.
Bundlers speed up the dev mode by bypassing bundling which can lead to many http requests
during the dev mode with `message-modules`. See https://github.com/opral/inlang-paraglide-js/issues/486.

**`message-modules`**

Messages have their own module which eases tree-shaking for bundlers.

```diff
  - outdir/
    - messages/
+   - blue_elephant_tree/
+     - index.js
+     - en.js
+     - fr.js
+   - sky_phone_bottle/
+     - index.js
+     - en.js
+     - fr.js
    - ...
  - messages.js
  - runtime.js
```

**`locale-modules`**

Messages are bundled in a per locale module. Bundlers often struggle with tree-shaking this structure,
which can lead to more inefficient tree-shaking and larger bundle sizes compared to `message-modules`.

The benefit are substantially fewer files which is needed in large projects.

```diff
  - outdir/
    - messages/
+     - de.js
+     - en.js
+     - fr.js
      - ...
  - messages.js
  - runtime.js
```

##### Default

```ts
"message-modules"
```

#### project

> **project**: `string`

Defined in: [compiler-options.ts:33](https://github.com/opral/paraglide-js/tree/main/src/compiler/compiler-options.ts)

The path to the inlang project.

##### Example

```diff
await compile({
+ project: "./project.inlang",
  outdir: "./src/paraglide"
})
```

#### strategy?

> `optional` **strategy**: [`Runtime`](runtime/type/README.md#runtime)\[`"strategy"`\]

Defined in: [compiler-options.ts:63](https://github.com/opral/paraglide-js/tree/main/src/compiler/compiler-options.ts)

The strategy to use for getting the locale.

The order of the strategy defines the precedence of matches.

For example, in `['url', 'cookie', 'baseLocale']`, the locale will be
first tried to be detected in the url, then in a cookie, and finally
fallback to the base locale.

The default ensures that the browser takes a cookie approach,
server-side takes the globalVariable (because cookie is unavailable),
whereas both fallback to the base locale if not available.

Custom strategies with the pattern `custom-[A-Za-z0-9]+` are supported.

##### Default

```ts
["cookie", "globalVariable", "baseLocale"]
```

#### urlPatterns?

> `optional` **urlPatterns**: [`Runtime`](runtime/type/README.md#runtime)\[`"urlPatterns"`\]

Defined in: [compiler-options.ts:248](https://github.com/opral/paraglide-js/tree/main/src/compiler/compiler-options.ts)

https://inlang.com/m/gerre34r/library-inlang-paraglideJs/strategy#url

***

## defaultCompilerOptions

> `const` **defaultCompilerOptions**: `object`

Defined in: [compiler-options.ts:3](https://github.com/opral/paraglide-js/tree/main/src/compiler/compiler-options.ts)

### Type Declaration

#### cleanOutdir

> `readonly` **cleanOutdir**: `true` = `true`

#### cookieDomain

> `readonly` **cookieDomain**: `""` = `""`

#### cookieMaxAge

> `readonly` **cookieMaxAge**: `number`

#### cookieName

> `readonly` **cookieName**: `"PARAGLIDE_LOCALE"` = `"PARAGLIDE_LOCALE"`

#### disableAsyncLocalStorage

> `readonly` **disableAsyncLocalStorage**: `false` = `false`

#### emitGitIgnore

> `readonly` **emitGitIgnore**: `true` = `true`

#### emitPrettierIgnore

> `readonly` **emitPrettierIgnore**: `true` = `true`

#### emitReadme

> `readonly` **emitReadme**: `true` = `true`

#### emitTsDeclarations

> `readonly` **emitTsDeclarations**: `false` = `false`

#### experimentalMiddlewareLocaleSplitting

> `readonly` **experimentalMiddlewareLocaleSplitting**: `false` = `false`

#### includeEslintDisableComment

> `readonly` **includeEslintDisableComment**: `true` = `true`

#### isServer

> `readonly` **isServer**: `"typeof window === 'undefined'"` = `"typeof window === 'undefined'"`

#### localStorageKey

> `readonly` **localStorageKey**: `"PARAGLIDE_LOCALE"` = `"PARAGLIDE_LOCALE"`

#### outputStructure

> `readonly` **outputStructure**: `"message-modules"` = `"message-modules"`

#### strategy

> `readonly` **strategy**: \[`"cookie"`, `"globalVariable"`, `"baseLocale"`\]
