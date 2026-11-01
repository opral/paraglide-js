---
"@inlang/paraglide-js": patch
---

Read `window.location.href` in `getLocale()` only when a route strategy or the `url` strategy needs it. Every message call resolves the locale, and each read of `window.location.href` serializes the URL; `getLocale()` read it up to three times per call.
