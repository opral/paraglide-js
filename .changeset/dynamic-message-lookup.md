---
"@inlang/paraglide-js": minor
---

Add `getMessage(key, inputs?, options?)` in generated `dynamic.js` for native ES module deployments using `message-modules`. The async API reuses existing per-message files, captures locale before loading, preserves literal-key input types, and reports loading failures through `MessageLoadError`. Deploy the generated folder intact; computed imports do not automatically emit assets in application bundlers.

The internal `messages/_then.js` module now exports `__paraglide_then` to prevent native dynamic import from treating its namespace as a thenable. Public `m.then()` and the named `then` export from `messages.js` remain available.

Reject message IDs that normalize to the same module filename instead of silently overwriting a message.
