---
"@inlang/paraglide-js": patch
---

Reduce shipped JavaScript for Vite's default message-module output by grouping surviving fully static locale dispatchers after tree shaking and before minification. Preserve message names, call signatures, explicit locale overrides and base-locale fallback; keep standard compilation for other bundlers and unminified, static-locale or middleware builds.
