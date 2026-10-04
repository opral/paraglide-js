---
"@inlang/paraglide-js": patch
---

Fix the generated `runtime.js` and `server.js` losing `import` lines from JSDoc `@example` blocks. The compiler strips each runtime module's own imports before inlining it, but the matcher was not anchored to the start of a line, so it also removed `import ... from '...'` text inside doc comments together with the following newline, merging the remaining comment lines (for example ` *   *   m.hello(...)`). The matcher is now anchored to the start of a line, so `*`-prefixed doc comment lines are kept while the modules' own imports are still stripped.
