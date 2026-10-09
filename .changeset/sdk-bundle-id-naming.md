---
"@inlang/paraglide-js": patch
---

Prepare the compiler for `@inlang/sdk` 4. SDK 4 returns the bundle id of a message as `bundle_id` instead of `bundleId`. Given SDK 4 messages, `compileMessage()` and `compileBundle()` read only `bundleId`, so a message without a catch-all variant fell back to the string "undefined" instead of its bundle id, and errors named `message "undefined"`. They now read either name and throw if a message has no bundle id. `compileMessage()` accepts messages and variants in both shapes (`CompilableMessage`, `CompilableVariant`). The fallback also escapes bundle ids that contain `"` or `\`.
