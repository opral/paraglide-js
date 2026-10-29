---
"@inlang/paraglide-js": major
---

Build formatters for literal options from the options' own properties only. A compiled `plural`, `number`, `datetime`, `relativetime` or ICU `#` call whose options are all literals, with plain identifier names and finite numbers, now ignores options added to `Object.prototype`, for example through prototype pollution. Such options no longer change or break these calls. This matches calls whose options are `undefined`, for which Intl already ignores `Object.prototype`. Options that read variables, other option names and direct registry calls keep reading inherited options.
