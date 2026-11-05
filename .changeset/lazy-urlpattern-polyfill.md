---
"@inlang/paraglide-js": minor
---

Add `lazyUrlPatternPolyfill: true` to load the URLPattern polyfill only when it is missing in generated runtimes with custom URL patterns or route strategies. This uses conditional top-level await and requires Vite 7+ or another ESM toolchain and runtime supporting top-level await. The option defaults to `false`, preserving the static polyfill import. Routing APIs remain synchronous.
