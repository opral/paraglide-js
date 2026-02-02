---
"@inlang/paraglide-js": patch
---

Preserve request bodies in `paraglideMiddleware` by cloning body-bearing requests before rewrapping them, preventing "Body has already been read" errors on POST/PUT/PATCH/DELETE.
