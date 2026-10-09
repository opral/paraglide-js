---
"@inlang/paraglide-js": patch
---

Format `datetime` without options in MessageFormat 2's default style, `dateStyle=medium timeStyle=short`.

Without options that pick what to show (`dateStyle`, `timeStyle`, or fields like `year`, `month`, `hour`), `datetime` used the default of `Intl.DateTimeFormat`, a numeric date like "10/9/2026". It now formats like `dateStyle=medium timeStyle=short`, the default of MessageFormat 2 (LDML 47), e.g. "Oct 9, 2026, 4:30 PM". Options that pick nothing, like `timeZone` and `hour12`, keep the default. For the defaults of ICU `{d, date}` and `{d, time}`, see "Format ICU MessageFormat 1 number, date and time styles".

**Behavior change:** `datetime` without options, such as `local formattedDate = date: datetime`, renders "Oct 9, 2026, 4:30 PM" instead of "10/9/2026". Pass `year=numeric month=numeric day=numeric` for the previous output.
