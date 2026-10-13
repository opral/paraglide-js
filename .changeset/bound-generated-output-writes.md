---
"@inlang/paraglide-js": patch
---

Bound filesystem concurrency for generated output across message modules, locale modules, declarations, and additional files. Propagate write, directory creation, and required deletion errors instead of silently reporting successful compilation with incomplete output. Drain active operations before rejecting, close the loaded project on failure, and preserve unchanged generated files when cleaning during a partial update.
