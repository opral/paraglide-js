---
"@inlang/paraglide-js": patch
---

Read the locale of the default URL pattern from the URL that `extractLocaleFromUrl()` already parsed, instead of parsing it a second time. `localizeHref()` and `localizeUrl()` extract the locale of every link they localize.
