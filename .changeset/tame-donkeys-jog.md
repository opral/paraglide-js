---
"@inlang/paraglide-js": patch
---

Fix `experimentalMiddlewareLocaleSplitting` keying `compiledBundles` by the raw bundle id instead of the safe module id, so every SSR message lookup missed and threw `globalThis.__paraglide.ssr.<id> is not a function` on hydration.
