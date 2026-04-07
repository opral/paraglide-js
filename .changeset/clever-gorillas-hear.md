---
"@inlang/paraglide-js": patch
---

Fix proxy-aware URL handling in `paraglideMiddleware()`, `shouldRedirect()`, and locale extraction by adding an `effectiveRequestUrl` override for browser-facing URLs behind TLS-terminating proxies and load balancers. Addresses [#652](https://github.com/opral/paraglide-js/issues/652).
