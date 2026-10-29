---
"@inlang/paraglide-js": minor
---

Add opt-in `experimentalVirtualMessages` to the Vite integration. Keep public
runtime/message entry points on disk, combine message declarations, and serve
individual message implementations virtually. Safe static message imports avoid
loading the complete message barrel while preserving per-message tree shaking.
