---
"@inlang/paraglide-js": patch
---

Format ICU MessageFormat 1 number, date and time styles.

The ICU MessageFormat 1 plugin imports `{n, number, integer}` as `{n: number style=integer}`, `{d, date, short}` as `{d: date style=short}` and `{d, time, short}` as `{d: time style=short}`.

- `date` and `time` were unknown formatters and printed the raw value, e.g. "Fri Oct 09 2026 16:30:00 GMT+0200". They now format like `datetime` with `dateStyle` and `timeStyle` (`short`, `medium`, `long`, `full`). `{d, date}` formats like `dateStyle=medium` and `{d, time}` like `timeStyle=medium`, ICU's defaults: "Oct 9, 2026" and "4:30:00 PM" in English.
- `number style=integer` passed `style: "integer"` to `Intl.NumberFormat`, which threw a `RangeError` when the message was called. It now formats with `maximumFractionDigits: 0`. Halves round away from zero like `Intl.NumberFormat` (`2.5` renders "3"), while ICU rounds them to the nearest even integer (`2.5` renders "2").
- A style without an `Intl` equivalent, like an ICU skeleton (`{n, number, ::currency/EUR}`, `{d, date, ::yyyyMMdd}`) or `style=currency` without a `currency` option, threw when the message was called. It is now left out with a warning, and the value is formatted without it.
