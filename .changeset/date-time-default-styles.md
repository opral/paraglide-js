---
"@inlang/paraglide-js": patch
---

Format dates without options in the default styles of MessageFormat 2 and ICU.

Without options that pick what to show (`dateStyle`, `timeStyle`, or fields like `year`, `month`, `hour`), the date formatters used the default of `Intl.DateTimeFormat`, a numeric date like "10/9/2026". They now add a default style, and keep options like `timeZone` and `hour12`. With options that pick what to show, nothing is added.

- `datetime` formats like `dateStyle=medium timeStyle=short`, MessageFormat 2's default: "Oct 9, 2026, 4:30 PM".
- `date`, as the ICU MessageFormat 1 plugin imports `{d, date}`, formats like `dateStyle=medium`, the default of ICU and MessageFormat 2: "Oct 9, 2026".
- `time`, as the ICU MessageFormat 1 plugin imports `{d, time}`, keeps ICU's `timeStyle=medium`: "4:30:00 PM". MessageFormat 2's `:time` defaults to `short`: write `time style=short` for it.

**Behavior change:** `datetime` without options, such as `local formattedDate = date: datetime`, renders "Oct 9, 2026, 4:30 PM" instead of "10/9/2026". Pass `year=numeric month=numeric day=numeric` for the previous output.
