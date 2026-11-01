---
"@inlang/paraglide-js": patch
---

With `outputStructure: "message-modules"` and one message per module, `messages/_index.d.ts` declares every message itself instead of re-exporting one declaration file per message, so TypeScript reads one declaration file for `messages.js`. The per-message declarations remain for direct imports.
