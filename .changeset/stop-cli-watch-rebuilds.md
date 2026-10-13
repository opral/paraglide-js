---
"@inlang/paraglide-js": patch
---

Cancel queued rebuilds when CLI watch mode shuts down, and ignore late watcher events or compile completions after shutdown. This prevents stopped watch sessions from recompiling or reopening file watchers.
