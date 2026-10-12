---
"@inlang/paraglide-js": patch
---

Reduce Vite production localization bytes for locale-module output by packing surviving static text after tree shaking and before minification. Keep the public message API and the existing output for CLI and other bundlers.
