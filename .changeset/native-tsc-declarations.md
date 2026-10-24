---
"@inlang/paraglide-js": patch
---

Emit TypeScript declarations with the `tsc` of TypeScript 7 when it is installed beside TypeScript 5/6 under the `@typescript/native` alias, as documented for `svelte-check --tsgo`. On large `locale-modules` projects this is much faster than the compiler API of TypeScript 5/6. The declarations change the way they do when upgrading `typescript` to 7: formatting, ordering and some JSDoc.
