---
"@inlang/paraglide-js": minor
---

Add `cookieSameSite` and `cookieSecure` compiler options for the locale cookie that `setLocale()` writes. Both attributes are omitted by default, so the cookie only changes when you opt in. `cookieSecure: "auto"` adds `Secure` only on `https:` pages, and `cookieSameSite: "none"` without `cookieSecure` throws when Paraglide compiles the runtime, because browsers drop that cookie.

The runtime exports `cookieSameSite` and `cookieSecure`, so server code that writes the same cookie with `Set-Cookie` can reuse the policy. With `"auto"`, the server has to resolve the protocol itself.
