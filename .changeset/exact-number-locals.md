---
"@inlang/paraglide-js": patch
---

Fix exact number matches on un-annotated local variables. A literal match on a local that aliases an input, such as `.local countPluralExact = {$count}` from ICU `{count, plural, =0 {…} one {…} other {…}}` imports, now compares like a match on the input itself, so `=0` matches the number `0` (and the string `"0"`). Variants are now also tried in MessageFormat 2 preference order (literal keys before catchalls, in selector order), so an exact `=0` variant wins over a plural category like French `one` regardless of how the variants are stored.
