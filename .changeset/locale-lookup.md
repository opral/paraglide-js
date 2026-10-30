---
"@inlang/paraglide-js": patch
---

Look up locales in `toLocale()` by their lowercased form instead of lowercasing every configured locale on each call. Calls that resolve their locale through the runtime's strategies paid one `toLowerCase()` per configured locale before the active one. The configured locales are treated as immutable, as their readonly type states.
