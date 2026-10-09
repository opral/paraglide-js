---
"@inlang/paraglide-js": minor
---

Import the registry only where a message calls it, and format ICU `#`.

- A message file imported `registry.js` whenever its text contained `registry.`, including message text such as "Open the registry. Now.", which failed TypeScript's `noUnusedLocals` in checked projects. The compiler now records which registry functions each message calls and imports the registry only when one is called.
- ICU MessageFormat 1 `#` (imported as `{$count :icu:pound}`) was an unknown formatter and printed the raw value. It now displays the number formatted for the locale like `:number`, minus the plural `offset` when the import carries one (`{$count :icu:pound offset=1}`, see opral/inlang#4441). `{count, plural, offset:1 … other {You and # others}}` renders "You and 1,233 others" for `count` 1234 in English, instead of "You and 1234 others".

**Behavior change:** `#` in messages imported with the ICU MessageFormat 1 plugin now renders locale-formatted numbers, as ICU does: `1234` renders as "1,234" in English and "1.234" in German, and fractions are rounded to at most three digits like `:number`.
