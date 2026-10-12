# AnythingLLM: app-native Vite replication

Source `Mintplex-Labs/anything-llm` at `2a10d052a1812d7be12c43f9024072cf26a27a8b`, captured 2026-10-12. The native app eagerly imports all **31** catalogs. Its frozen `frontend/yarn.lock` resolves **Vite 4.5.3** and **i18next 23.12.1**; these exact installed versions are also used for the isolated production-bundle comparison below. Node 22.23.2 and Yarn 1.22.22 were used. This is a newly sampled HEAD, not the unavailable original study pin.

## Isolated localization output

| Fixed output layout                              | Main gzip → candidate | Reduction | Main Brotli → candidate | Reduction |
| ------------------------------------------------ | --------------------: | --------: | ----------------------: | --------: |
| Message modules, inline static returns (#798)    | 1,102,061 → 855,154 B |     22.4% |     619,547 → 517,322 B |     16.5% |
| Locale modules, post-tree-shaking packing (#799) |   742,646 → 642,573 B |     13.5% |     582,828 → 476,554 B |     18.2% |

Each comparison holds the existing output structure constant. Main is `9446dd98ff578c96d76fe40b22be268bf7ac17ed`; the compiler snapshots include artifact hashes in the results. The packing hook actually changed the surviving Vite chunk. Minification is Vite's normal production minification, not a separate source-minification measurement. Brotli uses quality 11 and gzip uses Node's default compression.

Diagnostic runs spent about 8.7–18.5 seconds in the packing pass for a 13.1 MB linked chunk. That is a build-time cost requiring further profiling, not a page-load metric; it is excluded from the byte gate and deterministic byte records. The final run's duration is preserved separately in `results/anything-llm-packing-diagnostic.json`.

The native isolated bundle is 725,623 gzip / 511,597 Brotli bytes. Packed locale output is therefore **11.4% smaller by gzip and 6.9% smaller by Brotli** than native i18next in this bounded workload. The inline message-module output remains larger than native in both encodings.

There are 1,254 keys per locale. The adapter excludes these six plural-form keys symmetrically: `chat_window.source_count_one`, `chat_window.source_count_other`, `connectors.directory.search-results_one`, `connectors.directory.search-results_other`, `connectors.directory.total-documents_one`, and `connectors.directory.total-documents_other`. It includes 1,248 keys and checks all **38,688 key/locale pairs** before bundling and again in each final minified bundle. Selected-locale switching checks 4,992 pairs. The native side retains original resource hierarchy and property order; its `lowerCaseLng: true` setting is required to resolve `zh-tw` as the app does.

The app also uses markup and React `<Trans>`. Returning the same markup string does not establish rendered component parity. No whole-app Paraglide migration or page-load improvement is claimed by these catalog comparisons.

## Native route inventory

The actual native production build's French `/onboarding` route renders **Bienvenue / Commencer** with no page errors. Read-only API fixtures return onboarding incomplete and the default logo; there is no authentication backend. The route loads six successful resources totaling **3,986,964 raw / 1,110,825 gzip / 1,003,078 Brotli-Q4 bytes**. The main JS contributes 984,177 gzip / 883,251 Brotli-Q4 bytes. These are compressed response-body estimates, not CDN transfer headers. The capture stores a single local FCP/LCP observation solely for diagnostics; it is not a paired timing test or a field metric.

This eager-loading app warrants a full migration experiment. The compiler's component improvements alone do not prove a 40% whole-app gain. A faithful migration must preserve plurals, markup components, region resolution, fallback, and reactive locale changes before making that claim.

## Reproduce

From the Paraglide worktree:

```sh
git clone https://github.com/Mintplex-Labs/anything-llm.git .real-apps/anything-llm-source
git -C .real-apps/anything-llm-source checkout 2a10d052a1812d7be12c43f9024072cf26a27a8b
(cd .real-apps/anything-llm-source/frontend && corepack yarn@1.22.22 install --frozen-lockfile --non-interactive)

node benchmark/real-apps/run.mjs anything-llm "$PWD/.real-apps/anything-llm-source" native-vite-baseline .real-apps/baseline-compiler
node benchmark/real-apps/run.mjs anything-llm "$PWD/.real-apps/anything-llm-source" native-vite-inline .real-apps/inline-compiler
PARAGLIDE_OUTPUT_STRUCTURE=locale-modules node benchmark/real-apps/run.mjs anything-llm "$PWD/.real-apps/anything-llm-source" native-vite-locale-baseline .real-apps/baseline-compiler
PARAGLIDE_OUTPUT_STRUCTURE=locale-modules node benchmark/real-apps/run.mjs anything-llm "$PWD/.real-apps/anything-llm-source" native-vite-locale-functions .real-apps/packed-compiler

(cd .real-apps/anything-llm-source/frontend && ./node_modules/.bin/vite build --outDir ../../anything-native --emptyOutDir)
(cd .real-apps/anything-llm-source/frontend && ./node_modules/.bin/vite preview --outDir ../../anything-native --host 127.0.0.1 --port 4182 --strictPort)
# With preview running in another terminal:
mkdir -p .real-apps/anything-audit
node benchmark/real-apps/anything-native-route.mjs
```

Compiler snapshot setup is described in `README.md`. Deterministic byte and parity records are `results/anything-llm-{baseline,inline,locale-baseline,locale-functions}.json`; the route inventory is `results/anything-llm-native-route.json`. An independent Luna review is recorded separately. The original app checkout remains unchanged.
