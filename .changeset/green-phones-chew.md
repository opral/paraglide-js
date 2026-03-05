---
"@inlang/paraglide-js": patch
---

Fix compiler code generation for formatter option literals so Intl numeric and boolean options are emitted with the correct literal types.

This resolves strict `checkJs`/`svelte-check` errors where generated `number()` options like `minimumFractionDigits` were emitted as strings and caused `Type 'string' is not assignable to type 'number'`.
