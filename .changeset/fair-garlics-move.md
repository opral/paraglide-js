---
"@inlang/paraglide-js": minor
---

Improve emitted message-module output by gating middleware locale-splitting hooks behind `experimentalMiddlewareLocaleSplitting`.

When the option is disabled (default), generated message functions no longer emit:

- `if (experimentalMiddlewareLocaleSplitting && isServer === false) { ...__paraglide_ssr... }`
- `trackMessageCall(...)`
- related runtime imports (`experimentalMiddlewareLocaleSplitting`, `isServer`, `trackMessageCall`)

When `experimentalMiddlewareLocaleSplitting` is enabled, the existing SSR/middleware injection flow is preserved.
