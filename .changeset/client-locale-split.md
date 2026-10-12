---
"@inlang/paraglide-js": patch
---

Add an experimental Vite mode that splits client messages by locale and loads the startup locale before synchronous message calls run. Compact locale arrays store compiler-known static strings and retain generated functions for plural, interpolation and markup messages. Server-side rendering keeps the existing generated message graph.
