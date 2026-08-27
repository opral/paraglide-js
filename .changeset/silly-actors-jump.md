---
"@inlang/paraglide-js": patch
---

Fix `experimentalMiddlewareLocaleSplitting` corrupting the generated server file when a compiled message value contains a literal `$` (e.g. a price or currency symbol) that forms a `String.replace()` special replacement pattern such as `` $` ``.
