# Client locale-split public API probe

This tiny Vite app exercises the public client locale-split API used in the Luna review. It preserves an existing `localStorage` key named `locale`, performs an in-place English/French switch, preloads French, and then calls a message with an explicit locale. It does not collect timing data.

## Pins

- Compiler source: commit `6997d020813d76f087d585110e62cd54891726e0` (the setup and Vite config reject a different commit).
- Node: `22.23.2`.
- Vite: `8.1.4`.
- `@inlang/plugin-message-format`: `4.5.0`.
- Playwright: `1.57.0`.

The compiler checkout must have a built `dist/index.js`. Set `PARAGLIDE_COMPILER_ROOT` to its absolute path; the fixture does not copy compiler files or dependencies.

## Run

```sh
cd /path/to/paraglide-client-locale-split-public-api-probe
npm ci
export PARAGLIDE_COMPILER_ROOT=/path/to/paraglide-client-split-current-api
npm run setup
npm run build
npx playwright install chromium
npm run probe
```

The probe launches Chromium and serves the production `dist` folder locally. To write its JSON transcript to a specific path, set `OUTPUT_JSON`; to use an already-installed Playwright package instead of this fixture's dependency, set `PLAYWRIGHT_MODULE` to its absolute `index.mjs` path.

For example, from the Paraglide repository:

```sh
OUTPUT_JSON=/path/to/paraglide/benchmark/real-apps/results/luna-openwebui-public-api-probe.json npm run probe
```

The tracked template is `project-settings.template.json`. `npm run setup` writes the generated `project.inlang/settings.json` with the message-format module path resolved from this fixture's installed dependencies. Build output, generated Paraglide sources, the generated project folder, and `node_modules` are ignored.

The Vite config uses `paraglideVitePlugin` from the pinned compiler checkout's public `dist/index.js`, with `outputStructure: "locale-modules"`, `experimentalClientLocaleSplit: true`, `strategy: ["localStorage", "baseLocale"]`, `localStorageKey: "locale"`, and `build.target: "es2022"`. No private compiler entry point or message-call rewrite is used.
