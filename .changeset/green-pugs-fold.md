---
"@inlang/paraglide-js": minor
---

Add compiler support for markup messages with a new `message.parts()` API.

Messages that contain markup now compile to framework-neutral parts (`text`, `markup-start`, `markup-end`, and `markup-standalone`) while `message()` continues to return plain strings.
