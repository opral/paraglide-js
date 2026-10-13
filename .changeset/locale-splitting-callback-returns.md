---
"@inlang/paraglide-js": patch
---

Skip locale splitting for callback values without response headers or a body reader, and for consumed or locked bodies. Keep HTML injection working when the global `Response` constructor is replaced.
