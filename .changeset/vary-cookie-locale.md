---
"@inlang/paraglide-js": patch
---

Include `Cookie` in redirect `Vary` headers when the route uses the cookie strategy. Responses from `resolve` also vary by `Cookie` or `Accept-Language` when the corresponding strategies come before `url`, or when the URL does not supply a locale. Existing fields are kept without duplicates, and `Vary: *` is unchanged.

With the default strategy, HTTP responses now include `Vary: Cookie`. Shared caches that honor `Vary` distinguish responses by the full Cookie header, which can reduce cache reuse. Mutable responses retain their identity; network error responses are passed through unchanged. Copied responses keep their `url`, `redirected` and `type`, including when cloned.
