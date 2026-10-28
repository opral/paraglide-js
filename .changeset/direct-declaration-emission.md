---
"@inlang/paraglide-js": minor
---

Generate `.d.ts` files directly when `emitTsDeclarations` is enabled, removing TypeScript compiler analysis and the optional TypeScript peer dependency. TypeScript is no longer required to generate declarations.

Custom JavaScript supplied through `additionalFiles`, including overrides of generated modules, must now include companion `.d.ts` files when declarations are enabled. These declarations are copied verbatim.

Generated declarations preserve boolean literals and common `typeof` comparisons for `isServer`. Other custom expressions have type `any`, allowing bundler-specific expressions without analyzing JavaScript.
