---
"@inlang/paraglide-js": patch
---

Fix `extractLocaleFromHeader` picking languages the client rejected with `q=0` and ranking ranges by malformed weights. `fr; q=0.5` and `fr;Q=0.5` were read as unknown tags, and weights like `q=abc` or `q=2` were sorted as `NaN` or out-of-range numbers.

Ranges with `q=0` are now skipped, as RFC 9110 defines a weight of 0 as "not acceptable". Ranges whose weight is not a valid qvalue are skipped too. The `q` parameter is matched case-insensitively, whitespace around `;` and `=` is tolerated, and other parameters are ignored, including quoted values that contain `,` or `;`. `shouldRedirect()` and `paraglideMiddleware()` reach this function through the `preferredLanguage` strategy, so their redirects follow the same rules.
