---
"@inlang/paraglide-js": patch
---

fix `emitTsDeclarations` with TypeScript 7 https://github.com/opral/paraglide-js/issues/711

TypeScript 7 (the Go-based compiler) no longer ships the in-process compiler API that Paraglide used to generate `.d.ts` files, which made `paraglide-js compile --emit-ts-declarations` fail with `TypeError: Cannot read properties of undefined (reading 'ESNext')`. Paraglide now detects this and invokes TypeScript's `tsc` CLI instead. TypeScript 5 and 6 keep using the compiler API as before.

Note that the declaration output of TypeScript 7 differs cosmetically from TypeScript 5/6 (quote style, declaration ordering, `export declare const` vs `export const`) but is semantically equivalent.
