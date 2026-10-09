---
"@inlang/paraglide-js": minor
---

Import the registry only where a message calls it, and format ICU `#`.

- A message file imported `registry.js` whenever its text contained `registry.`, including message text such as "Open the registry. Now.", which failed TypeScript's `noUnusedLocals` in checked projects. The compiler now records which registry functions each message calls and imports the registry only when one is called.
- ICU MessageFormat 1 `#` (imported as `{$count :icu:pound}`) was an unknown formatter and printed the raw value. It now displays the number formatted for the locale like `:number`, minus the plural `offset` when the import carries one (`{$count :icu:pound offset=1}`, see opral/inlang#4441). `{count, plural, offset:1 … other {You and # others}}` renders "You and 1,233 others" for `count` 1234 in English, instead of "You and 1234 others". Only numbers and numeric strings are formatted. Anything else is displayed as is, like `{count}`, without subtracting the offset: `"abc"`, `"1,234"` and `""` display unchanged, `null` and `undefined` display `"null"` and `"undefined"`, and a bigint displays its digits unformatted, so it keeps its precision. The plural category is still selected on `Number(count)`, so `""` and `null` select the category of 0, and a bigint beyond `Number.MAX_SAFE_INTEGER` loses precision there, as before.
- With `experimentalMiddlewareLocaleSplitting`, the messages the middleware injects into the page threw `ReferenceError: registry is not defined` on the client when they called a registry function (`:plural`, `:number`, `#`, …). The injected script now declares the registry functions those messages call.
- An `offset` from a variable (`:plural offset=$offset`, `:icu:pound offset=$offset`) no longer fails `checkJs`. Both functions type it as `unknown` and convert it with `Number()`.
- An unknown formatter on a local variable (`.local y = {$x :custom}`) compiled to `registry.custom(...)`, which failed `checkJs` and threw "registry.custom is not a function". It now interpolates the raw value with a warning, like an unknown formatter in a pattern.
- `.parts()` of a markup message failed `checkJs` (`Property 'parts' does not exist`) when a locale's message had no markup of its own: a fallback to another locale, a message without markup, or the bundle id fallback. The bundle function now reads `.parts` through a type that declares it optional.

**Behavior change:** `#` in messages imported with the ICU MessageFormat 1 plugin now renders locale-formatted numbers, as ICU does: `1234` renders as "1,234" in English and "1.234" in German, and fractions are rounded to at most three digits like `:number`.
