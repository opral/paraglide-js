---
"@inlang/paraglide-js": patch
---

Fix numeric input match inference so generated message typings accept both numeric and string literal forms for values like `input=1`, matching runtime behavior without relying on broad loose coercion.
