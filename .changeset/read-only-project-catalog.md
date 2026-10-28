---
"@inlang/paraglide-js": minor
---

Compile directory projects through the SDK's `loadProjectCatalog()` API when available, bypassing database import, commits, and nested-message queries. Add `compileCatalog()` for compiling detached settings and bundles; the existing `compileProject()` API and published SDK compatibility remain supported. Remote plugin caching continues to support offline builds.

On a local three-locale benchmark with declarations and all generated files written to disk, fresh-process full builds with the default message layout fell from 4.51 s to 0.91 s for 6,400 keys (80% less time, 4.9× faster), and from 7.28 s to 1.70 s for 13,300 keys (77% less time, 4.3× faster). Locale-layout builds fell from 3.96 s to 0.47 s and from 6.43 s to 0.94 s. These are medians of three serial trials against SDK 4.0.4, using the locally linked catalog implementation; results depend on the project and machine. Generated JavaScript and declarations matched the previous pipeline. See `benchmark/project-catalog` for methodology and results.

The catalog speedup requires an SDK version exposing `loadProjectCatalog()`; older SDK versions continue to use the project loader.
