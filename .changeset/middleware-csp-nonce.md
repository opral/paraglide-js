---
"@inlang/paraglide-js": patch
---

`experimentalMiddlewareLocaleSplitting`: the injected inline script now reuses the nonce from the response's `Content-Security-Policy` header, so it is allowed under a strict CSP instead of being blocked and breaking hydration. Automatic - no configuration needed.
