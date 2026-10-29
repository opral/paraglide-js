---
"@inlang/paraglide-js": minor
---

Add a bundler-independent `isDevelopment` compiler expression for runtime diagnostics. Vite uses its resolved development/production mode; other bundler plugins default from `NODE_ENV`. Standalone compilation can disable diagnostics with `isDevelopment: "false"` or `--is-development false`.

Make locale-specialized override warnings development-only and allow unused cookie-pattern setup to be tree-shaken. Keep the shared `globalThis.__paraglide` runtime object initialized for backward compatibility and future runtime behavior.
