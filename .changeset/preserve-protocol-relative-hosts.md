---
"@inlang/paraglide-js": patch
---

Keep protocol-relative hrefs in `localizeHref()` and `deLocalizeHref()` instead of dropping their host. For example, with locale `de`, `//cdn.example.com/docs` now becomes `//cdn.example.com/de/docs` instead of `/de/docs`. This also handles `/\` and separators containing tabs or newlines. Explicit ports are preserved, including default ports such as `:80`. Links keep their implicit protocol on the server outside the middleware, where `getUrlOrigin()` uses a fallback origin. Configured protocol or port changes still produce absolute URLs.
