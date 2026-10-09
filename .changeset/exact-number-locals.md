---
"@inlang/paraglide-js": minor
---

Fix exact number matches on un-annotated local variables, and select variants in MessageFormat 2 preference order.

- A literal match on a local that aliases an input, such as `.local countPluralExact = {$count}` from ICU `{count, plural, =0 {…} one {…} other {…}}` imports, now compares like a match on the input itself, so `=0` matches the number `0` (and the string `"0"`). Annotated locals (`:plural`, `:number`, …) still match their result as a string.
- Variants are now tried in preference order: literal keys before catchalls, selector by selector, instead of in storage order. An exact `=0` variant now wins over a plural category like French `one`, and a catchall stored first no longer hides later variants.

**Behavior change:** a message whose variants relied on storage order may now select a different variant. The new choice is the one the MessageFormat 2 spec selects. For example, with selectors `platform, gender` and the variants `* male`, `android *`, `* *`, the input `android` + `male` used to select `* male` and now selects `android *`.
