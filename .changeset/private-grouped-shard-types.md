---
"@inlang/paraglide-js": patch
---

Grouped message modules (`messageModuleSize` above 1) no longer export their shared helper types. Every shard declared `__ParaglideOptions`, `__ParaglideMessage` and `__ParaglideOptionalMessage`, so `messages.js` exported them: a module that re-exported `messages.js` beside another export of those names failed with TS2308, and with two or more shards `messages/_index.js` (with `checkJs`) and `messages/_index.d.ts` (with `skipLibCheck: false`) failed because their `export *` exported the same names from every shard. The helpers are now declared once, in `messages/_shard_types.js` and `.d.ts`, which the barrel does not re-export, and each shard imports them type-only.
