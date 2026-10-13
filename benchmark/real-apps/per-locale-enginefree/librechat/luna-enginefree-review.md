# Independent engine-free semantics review — LibreChat

Read-only source and artifact review of the frozen engine-free candidate. I did not run a build or browser session; the candidate author supplied the frozen French build audit and native-oracle reports.

## Findings

The app’s current catalogs and tested translation calls are compatible with the fixed-locale adapter in the checked cases. The corpus contains one flat `translation` namespace, 50,209 physical strings across 41 locale catalogs, and no nested values, arrays, ICU/Intl format strings, or dotted catalog keys. The adapter loads the selected locale plus English and resolves missing selected-locale messages through English (`client/src/i18n/index.js:8-14`; `client/src/i18n/runtime.js:3-4,18-27`). The native setup also uses one default namespace, `fallbackNS: 'translation'`, `load: 'currentOnly'`, and `interpolation.escapeValue: false` (`/root/repos-iii/librechat-native-preload-control/client/src/locales/i18n.ts:288-305`).

The author’s semantic oracle reports 186,433 native comparisons with no differences across all 41 locales and all 50,209 physical strings (`semantic-parity.json`). The Trans oracle reports 1,476 passing cases across all locales, all eight app Trans sites, and four distinct keys/legal variants, including explicit markup-like values and retention of the supplied event handler and other component props (`trans-parity.json`). The adapter uses `html-parse-stringify` to reproduce the installed native parser’s malformed-markup behavior (`client/src/i18n/trans.jsx:1,33-65`).

The React adapter returns the native tuple/object shape consumed by the app and reports `ready: true` (`client/src/i18n/react-adapter.jsx:3`). That matches a fixed-locale bundle with resources already loaded, but the hook lifecycle and Suspense transitions were source-audited rather than mounted against native. `Trans` checks namespace readiness and can suspend (`client/src/i18n/trans.jsx:68-75`); for the app’s sole `translation` namespace the runtime reports loaded and resolves the check immediately. For any additional namespace, `hasLoadedNamespace` remains false while `ensureNamespaces` resolves without loading it, so the adapter does not provide general multi-namespace loading semantics (`client/src/i18n/runtime.js:42-43`; `client/src/i18n/index.js:13`).

The French emitted-graph audit includes 7,771 module IDs across emitted chunks and reports no forbidden i18next, react-i18next, or language-detector modules (`client/dist-enginefree/__paraglide/fr-6672/engine-absence-audit.json`). This establishes engine absence for that French output only; other locale builds were not audited in this review.

## Limits of the evidence

The tested app surface does not exercise `exists`, `returnObjects`, nested or dotted catalog keys, ordinal/context variants, additional namespaces, or formatted interpolation. The adapter has limited behavior for these general APIs: `exists` ignores its namespace argument, resource lookup is flat, and interpolation only substitutes simple `{{name}}` tokens. The passing corpus supports the app’s current catalog shape and observed use, not full i18next API parity.

Locale changes persist the requested locale and reload the document to select another fixed-locale artifact (`client/src/i18n/index.js:5-8,16-18`). Deployment therefore needs to serve the artifact matching the persisted locale. I did not independently verify server routing or browser behavior.

The app-only TypeScript check completed with zero diagnostics (`typecheck-app.log`). The full check still has two test-only errors where legacy tests pass the custom runtime to `I18nextProvider`, whose type requires the full native i18next instance (`typecheck.log`, `AuthLayout.spec.tsx:72`, `Registration.spec.tsx:97`). The runtime intentionally replaces the engine and is not a drop-in provider implementation; this does not establish an application-source type error.

The evidence is bounded to native-oracle corpus and Trans checks, one emitted French module graph, and source inspection. It does not establish app-wide runtime parity beyond the exercised translation surface or verify the locale-switch deployment path.

## Primary reviewed sources

- `client/src/i18n/runtime.js:1-52`
- `client/src/i18n/react-adapter.jsx:1-5`
- `client/src/i18n/trans.jsx:1-99`
- `client/src/i18n/index.js:1-23`
- `locale-metadata.json` (locale aliases and supported locales)
- `semantic-parity.json` and `semantic-parity.mjs`
- `trans-parity.json` and `trans-parity.mjs`
- `client/dist-enginefree/__paraglide/fr-6672/engine-absence-audit.json`
- `typecheck-app.log` and `typecheck.log`
