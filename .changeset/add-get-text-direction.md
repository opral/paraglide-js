---
"@inlang/paraglide-js": minor
---

Add a new runtime utility: `getTextDirection(locale?)`.

- Returns `"ltr"` or `"rtl"` for a given locale.
- Defaults to the current locale from `getLocale()` when no locale is provided.
- Uses `Intl.Locale` text info when available, with a safe RTL fallback for runtimes without that API.

Also updates SvelteKit example/docs to show setting both `%lang%` and `%dir%` in `app.html` using runtime APIs.
