---
"@inlang/paraglide-js": patch
---

Escape line breaks in the quoted string literals the compiler emits, such as formatter option values and `.local` literals. A literal containing a line break made the generated module fail to parse.
