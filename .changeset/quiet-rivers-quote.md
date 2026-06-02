---
"@inlang/paraglide-js": patch
---

Fix emitted TypeScript declarations for message keys that require quoted export aliases, such as dotted nested keys.

`emitTsDeclarations` now preserves quoted aliases from the generated JavaScript so `.d.ts` output remains valid for keys like `greeting.hello`. The optional TypeScript peer dependency now requires TypeScript 5.6 or newer, which supports arbitrary quoted module export names.
