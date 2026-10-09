---
"@inlang/paraglide-js": minor
---

Requires `@inlang/sdk` 4.

Paraglide now depends on `@inlang/sdk` ^4.0.0. Projects and plugins need no changes: plugins still exchange camelCase `bundleId` and `messageId`, and the compiled output is the same. If you call `compileProject()` with an `InlangProject` you load yourself, load it with `@inlang/sdk` 4. Code that writes to `project.db` directly uses the SDK 4 table and column names (`inlang_bundle`, `bundle_id`, `message_id`), see "Migrating to 4.0" in the SDK README.
