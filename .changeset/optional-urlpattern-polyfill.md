---
"@inlang/paraglide-js": minor
---

Add `urlPatternPolyfill: false` to omit the URLPattern polyfill import from generated runtimes with custom URL patterns or route strategies. Use it when target runtimes provide native URLPattern or the application installs its own polyfill. The default behavior is unchanged.
