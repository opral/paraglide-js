# Independent engine-free semantics review — Frigate

Read-only source and artifact review of the frozen candidate in `web/src/enginefree/`. I did not run a build or browser session.

## Findings

The fixed-locale adapter preserves the app’s sparse resource model and its English fallback in the reviewed paths. The runtime resolves locale → configured regional fallback(s) → English, and the locale loader keeps missing namespaces as empty resources instead of merging catalogs (`web/src/enginefree/core.js:16-20,27-30`; `web/src/compiled-namespaces-single/loaders.js`). Dotted/nested key lookup and recursive `returnObjects` handling are implemented in `core.js:4-12,23`. The latest native parity supplement checks both a synthetic flat `flat.key` resource and nested `returnObjects`; it also checks fixed-translation prefix behavior.

The latest recorded native-oracle reports show 490,245 `t`/`exists` comparisons across 33 locales and 29 namespaces with zero differences (`benchmark/semantic-parity.json`). The comparator initializes i18next with Frigate’s actual `parseMissingKeyHandler`, so the candidate’s missing-key behavior is intentionally the app’s custom label, including when `defaultValue` is supplied (`benchmark/parity.mjs`; `benchmark/native-earlylocale-i18n.ts`). The 1,255 catalog-markup Trans cases and the 1,255 dynamic-value Trans cases also report zero differences (`benchmark/trans-parity.json`, `benchmark/trans-dynamic-parity.json`). These compare SSR markup against installed native `react-i18next`, including explicit values containing tag-like text.

The hook follows the native object-shaped return used by this app. It suspends while requested namespaces load, returns `ready: false` with `useSuspense: false`, and triggers a render when loading settles (`web/src/enginefree/react-adapter.js:11-38`). The app call sites use object destructuring. This behavior is source-audited; the parity scripts do not mount the hook or compare its ready/suspension transitions.

An additional AST-driven Trans oracle now checks 78 of 80 discovered JSX sites whose keys are static, for English and French (156 real-site checks), plus 144 literal-child checks and eight synthetic nested/numeric-child and count/context cases. It reports zero differences (`benchmark/trans-source-parity.json`). Named component props are compared structurally, including preservation of `onClick`; no click event is dispatched.

The French emitted-module audit contains 8,756 module IDs and no `i18next`, `react-i18next`, or browser-language-detector package modules (`benchmark/emitted-module-ids-fr.json`). This is one French build’s module graph, not proof for every locale build.

## Limits of the evidence

The Trans oracles cover catalog markup with explicit values, 78 static-key application call sites in English and French, literal-child keys, and a bounded set of nested/numeric React-child and count/context cases. Two dynamic-key JSX sites are skipped by the AST oracle. The child/count/context cases are synthetic rather than a full cross-locale matrix; the component event-handler check verifies property identity, not interactive dispatch. The zero-difference reports should not be generalized beyond those tested combinations.

One general runtime API difference surfaced in the supplemental key-prefix checks: the custom global `t(key, { keyPrefix })` applies that prefix, while native global i18next `t` ignores the option. The Frigate app has no calls in this form. Its fixed-translation API (`getFixedT`) prefix behavior was checked against native and matched. This is a documented adapter limitation, not a corpus mismatch.

The catalogs contain no ICU/Intl interpolation formats, and the native initialization has no custom interpolation formatter. The adapter only implements its listed `number` and `datetime` placeholder formats; other formatter patterns are outside the checked app surface. No browser interaction or locale-switch route was independently checked. Locale switching in this candidate uses document reloads, so deployment must serve the matching locale artifact for the persisted locale.

The implementation is a compatibility runtime around the existing Frigate translation calls, rather than a direct per-message Paraglide API conversion. The reviewed evidence supports the exercised translation surface; it does not establish full application-wide runtime parity.

## Primary reviewed sources

- `web/src/enginefree/core.js:4-30`
- `web/src/enginefree/index.js:1-10`
- `web/src/enginefree/react-adapter.js:11-38`
- `web/src/enginefree/paraglide-trans.jsx:32-126`
- `benchmark/parity.mjs`
- `benchmark/trans-parity.mjs`
- `benchmark/trans-dynamic-parity.mjs`
- `benchmark/trans-source-parity.mjs`
- the supplemental dotted-key, object-return, and fixed-T-prefix cases in `benchmark/parity.mjs`
- `benchmark/emitted-module-ids-fr.json`
