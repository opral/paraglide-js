---
"@inlang/paraglide-js": patch
---

Write catalog and option strings into generated code so they keep their exact value. An input name or match key containing `*/` no longer ends the generated JSDoc. `localStorageKey`, `cookieName` and `cookieDomain` may contain quotes, backslashes, `$&` or text of the runtime template, like `<cookie-domain>`. The fallback of an untranslated key with an apostrophe no longer breaks `locale-modules` output. Markup options and attributes named `__proto__` are own properties of `.parts()` objects, and formatter options with a namespace or a dash, like `u:locale`, compile.
