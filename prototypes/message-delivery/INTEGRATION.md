# Integrated virtual message prototype

The opt-in `experimentalVirtualMessages: true` Vite option serves the facade and individual JavaScript message modules virtually while writing one `messages.d.ts`. Existing application import paths stay the same. It uses the compiler's real SDK loading, serial compilation queue, watcher and error handling, rather than benchmark-only fixtures.

## Verified applications

Tests use temporary copies of the repository examples and a real Chromium browser. Every application passes a fresh-process production build, preview/browser execution, dev execution and its TypeScript checks. SvelteKit and TanStack Start additionally exercise SSR and hydration; React is a client application.

| Application    | Installed versions                                 | Checks                                                                                                                                                                                                                             |
| -------------- | -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SvelteKit      | Kit 2.69.2, Svelte 5.56.4, Vite 8.1.4, TS 5.8.3    | Dev SSR/hydration; browser locale switch; watched translation edit and browser reload; production SSR/prerender/build and browser; normal strict `checkJs` checking; application/generated declarations with `skipLibCheck: false` |
| TanStack Start | Start 1.168.27, React 19.2.3, Vite 8.1.4, TS 5.9.3 | Dev and production SSR/hydration and client navigation; server function and loader messages; native Vite `tsconfigPaths` aliases with extensionless and `.js` imports; application type checking                                   |
| React/Vite     | React 18.3.1, Vite 6.4.1, TS 5.6.2                 | Dev and production client rendering; application type checking with `checkJs: true`                                                                                                                                                |

The TanStack temporary fixture uses `.inputValidator` in place of the example's legacy `.validator` spelling and removes an unused import; the repository example is not edited.

**Dependency-check limitation:** SvelteKit's whole-project `skipLibCheck: false` check reports 37 existing dependency/public-package declaration errors, including missing optional bundler peer types, old TypeBox declarations and runtime source types pulled into the Vite config. Switching to ordinary disk output produces the same 37 error messages. Checking application code and generated declarations with library checking enabled passes. The prototype does not suppress these errors or claim that this whole-project configuration is green.

## Compiler and transport verification

- 36 TypeScript 5.9.2 configurations pass: Node16, NodeNext and Bundler; JavaScript disabled or enabled with `checkJs` on/off; both `skipLibCheck` settings; consumer-only roots or whole generated output inclusion. All are strict and also use isolated modules, verbatim module syntax, unchecked side-effect import checks, exact optional property types and unchecked index access checks. Positive calls and expected invalid input/locale calls verify that declarations provide real types.
- Vite 5.4.21, 6.4.1, 7.3.1 and 8.1.4 pass dev SSR, production bundling, unused-message tree shaking and migration from existing disk output to seven physical implementation/declaration files. Optional README/ignore files are disabled for that count.
- The integrated watcher regression covers edited messages, added and removed exports, malformed-resource recovery, cold plugin restarts, TypeScript path aliases and unused-message elimination. Lower-level transport tests cover directory isolation, no-op updates, relative disk registry imports, quoted/reserved message IDs, a message named `m`, markup, input types and locale unions.
- Core suite: 1,087 passed, five skipped across 70 files. The package TypeScript build passes.

Observations were recorded on Node 24.22.1. Machine-readable results are in [results/integration.json](./results/integration.json). Commands and dependency prerequisites are in [README.md](./README.md#integrated-vite-prototype).

## Boundaries

The option is experimental and defaults off. It does not change the compiler's global declaration boolean or other bundler integrations. Runtime, server and registry modules stay physical. An internal publication hook updates virtual implementations only after physical publication succeeds. In-memory implementations cannot be restored from the persistent disk cache, so each new virtual plugin instance recompiles; warm compilation still uses incremental catalog state. Obsolete disk message output is removed when switching modes.

The prototype sends full reloads. It eagerly generates and retains implementations, and assembles the single declaration from the direct emitter's fixed declaration format. Deep message imports have no matching declaration leaves. Running these generated message imports directly through Node or another tool without this Vite integration is unsupported. Per-locale-build experiments are intentionally rejected. Historical benchmark tables were not rerun for the final integrated implementation.
