---
"@inlang/paraglide-js": patch
---

`getLocale()`, `setLocale()` and `extractLocaleFromCookie()` no longer throw when `document.cookie` or `localStorage` throws, as both do with a `SecurityError` in sandboxed iframes without `allow-same-origin` and other documents with an opaque origin. A failed read falls through to the next strategy. A failed write is skipped, so `setLocale()` still navigates or reloads.

The first `getLocale()` call writes the cookie, so a page whose locale came from the URL used to throw on its first message.
