---
"@inlang/paraglide-js": patch
---

Compile messages with `@inlang/sdk` 3 and 4. SDK 4 returns the bundle id of a message as `bundle_id` instead of `bundleId`. The compiler read only `bundleId`, so with SDK 4 a message without a catch-all variant fell back to the string "undefined" instead of its bundle id, and errors named `message "undefined"`. The compiler now reads either name and throws if a message has no bundle id. `compileMessage()` accepts messages and variants in both shapes.
