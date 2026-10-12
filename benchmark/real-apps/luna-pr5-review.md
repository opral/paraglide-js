# Independent review: PR5 static text arrays in locale chunks

Reviewer: GPT-6 Luna, extra-high reasoning. Candidate: isolated `paraglide-client-payload-pr5`, reviewed against PR4 baseline `d54f8c4`. This is a correctness review of the current uncommitted candidate; I did not modify candidate source.

## Findings

I found no correctness blocker in the indexed locale payload path. The compiler derives `staticTexts` only from a one-variant message whose pattern consists entirely of literal text. It applies the same CR/CRLF-to-LF normalization that the generated template literal applies. Locale modules then use a positional array: literal strings occupy their metadata index, while nonliteral messages import their generated locale function at that same index. The public facade keeps its existing named functions, argument shapes, `.parts()` properties, and `m` namespace; only the private dynamic locale module shape changes.

Index correspondence is grounded in one compiler ordering: both metadata and locale-module generation iterate the selected bundle list in the same order. I exercised a compiler-generated mixed payload with static text, interpolated text, plural variants, and markup, then ran the emitted virtual core, facade, loader, and locale modules. CRLF text normalized as expected, dynamic calls preserved their inputs, plural selection stayed locale-specific, and missing locale messages followed the existing fallback chain. `de-AT` fell back to `de`; `fr` fell back to `en`. Markup `.parts()` matched the generated message output, including the plain-text `.parts()` fallback when the selected locale's message has no markup.

The newly observed test failure was a stale assertion, not a source behavior failure: the empty fixture expected `export default []` and then still asserted the old `export default messages` shape. The author removed that assertion during review. The rerun of the Vite test file passed all six tests.

The internal payload arrays are not exposed by the public API. `loadLocale` still resolves only after a locale payload has loaded and validated; unsupported locales reject. The public Vite option and compiler signatures do not gain another flag. Existing constraints remain: experimental client mode needs top-level await support and the opt-in switch path, and the feature still ships the full selected locale's message key set.

## Checks performed

- Initial `pnpm exec vitest run src/bundler-plugins/vite.test.ts src/compiler/compile-project.test.ts`: compiler suite passed (79 passed, 4 skipped); the Vite file had one stale assertion failure. `pnpm exec tsc --noEmit` passed.
- After the author removed the stale assertion, `pnpm exec vitest run src/bundler-plugins/vite.test.ts`: 6 passed.
- Native Node ESM probe over `compileProjectForVite` output and the plugin's generated modules: literal CRLF normalization, static and dynamic index dispatch, interpolation, plural messages, markup string and `.parts()`, regional and base fallbacks, unsupported `loadLocale`, custom getter preload, and custom setter preload all passed.
- The focused facade test also covers a public message named `then`, function arity, null options behavior, `.parts()` property flags, and namespace freezing. The locale modules' default payload is now an array, so the internal dynamic import result itself has no `then` export.

## Multi-turn API experience

**Turn 1 — “Integrate the mode without changing message calls.”** I followed the public compiling-messages guide, enabled `experimentalClientLocaleSplit` on the existing `paraglideVitePlugin`, set `build.target: "es2022"`, and kept ordinary `m.message()` calls. No PR5-specific compiler flag or message-call change was needed. The generated loader is still the only new public runtime import.

**Turn 2 — “Switch language and use an explicit override.”** I used `await loadLocale("de")`, then kept the explicit message call synchronous with `{ locale: "de" }`; the documented in-place switch remains `await setLocale("de", { reload: false })`. The compiler-generated probe exercised `en → de → en`, explicit calls, markup, and missing-locale fallback. All returned the expected output.

**Turn 3 — “Keep custom locale getter/setter behavior.”** I installed a custom getter and awaited `loadLocale(getLocale())` before rendering. I then replaced the setter with an async callback that awaited `loadLocale(locale)` before updating its selected locale. Both calls to the ordinary synchronous message facade returned the newly selected language. This matches the override guidance already added to the public docs; PR5 does not add an extra compiler flag or change message-call signatures.

## Boundaries

The executable parity probe used compiler-generated ESM and Node's module loader rather than a browser. It validates payload semantics but not browser network/cache behavior or paint timing. The Vite integration test exercises the actual Vite build path. This review did not run the full repository suite or independently verify production byte gates; PR5 remains a candidate until those gates pass.
