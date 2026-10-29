---
"@inlang/paraglide-js": major
---

Add `outputStructure: "virtual-modules"` and make it the default for the Vite
integration in development and production. Keep public
runtime/message entry points on disk, combine message declarations, and serve
individual message implementations virtually. Safe static message imports avoid
loading the complete message barrel while preserving per-message tree shaking.

This layout requires the Vite plugin. Select `outputStructure: "message-modules"`
or `"locale-modules"` explicitly for physical message files, standalone Node
scripts or grouped output. CLI and other bundler defaults remain unchanged.
