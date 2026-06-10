---
"@inlang/paraglide-js": minor
---

Compile pattern-level function-reference annotations to registry calls

Annotations attached directly to pattern expressions (e.g. i18next's `{{count, number}}` imported via plugin-i18next) were silently dropped and compiled to plain interpolation. They now compile through the same `registry.*` path as local-variable annotations:

```js
// before
const en_views = (i) => `${i?.count} views`;
// after
const en_views = (i) => `${registry.number("en", i?.count, {})} views`;
```

Unknown formatter names fall back to plain interpolation with a compile-time warning instead of failing or staying silent. `compilePattern()` gained an optional `locale` parameter, required to compile annotations.

Fixes https://github.com/opral/paraglide-js/issues/694
