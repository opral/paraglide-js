---
"@inlang/paraglide-js": minor
---

Generate `.d.ts` files directly when `emitTsDeclarations` is enabled, removing TypeScript compiler analysis and the optional TypeScript peer dependency. TypeScript is no longer required to generate declarations.

On a synthetic project with 6,400 messages and three locales, declaration generation takes 23 ms for `message-modules` and 26 ms for `locale-modules`, compared with 2.22 s and 2.54 s through TypeScript 7 (about 99% less time). The TypeScript 5 path takes 3.48 s and 20.03 s, respectively. These are medians of three runs on Node.js 22 and measure declaration generation only, excluding project loading, JavaScript generation, and final output writes.

Generated declarations preserve boolean literals and common `typeof` comparisons for `isServer`. Other custom expressions have type `any`, allowing bundler-specific expressions without analyzing JavaScript.
