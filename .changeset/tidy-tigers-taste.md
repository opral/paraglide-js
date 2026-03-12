---
"@inlang/paraglide-js": minor
---

Add `toLocale()` for case-insensitive locale normalization, make `isLocale()`
strictly match canonical project locales, and return canonical locale values
across runtime locale helpers.

```ts
// configured locales: ["fr", "en-US"]

isLocale("FR"); // false
toLocale("FR"); // "fr"

isLocale("en-us"); // false
toLocale("en-us"); // "en-US"
```

Runtime helpers that resolve locales from external input now return canonical
project locale values as well.
