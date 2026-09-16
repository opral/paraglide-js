---
"@inlang/paraglide-js": patch
---

Fix default URL routing dropping trailing slashes when localizing or delocalizing paths. When `trailingSlash` is omitted, `/about/` now becomes `/en/about/` and `/en/about/` delocalizes to `/about/`, matching equivalent explicit URL patterns. Paths without trailing slashes and localized root behavior remain unchanged. Set `trailingSlash: "never"` to explicitly generate slashless URLs; `"always"` continues to enforce trailing slashes.
