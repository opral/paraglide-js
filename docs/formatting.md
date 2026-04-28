---
title: Formatting
description: Locale-aware number, date, and relative-time formatting in Paraglide JS using message declarations.
---

# Formatting

Paraglide supports locale-aware formatting in message declarations when you use the **inlang message format plugin**.

Built-in formatter names:

- `plural` (uses `Intl.PluralRules`)
- `number` (uses `Intl.NumberFormat`)
- `datetime` (uses `Intl.DateTimeFormat`)
- `relativetime` (uses `Intl.RelativeTimeFormat`)

> [!NOTE]
> The formatter names are exactly `plural`, `number`, `datetime`, and `relativetime`.

## Number formatting

Use a local declaration to format a numeric input:

```json
{
  "personal_balance": [{
    "declarations": [
      "input amount",
      "local formattedAmount = amount: number"
    ],
    "match": {
      "amount=*": "Your balance is {formattedAmount}."
    }
  }]
}
```

`number` forwards options to `Intl.NumberFormat`:

```json
{
  "balance_fixed_decimals": [{
    "declarations": [
      "input amount",
      "local formattedAmount = amount: number minimumFractionDigits=2 maximumFractionDigits=2"
    ],
    "match": {
      "amount=*": "Balance: {formattedAmount}."
    }
  }],
  "price_in_usd": [{
    "declarations": [
      "input amount",
      "local formattedAmount = amount: number style=currency currency=USD"
    ],
    "match": {
      "amount=*": "Price: {formattedAmount}"
    }
  }]
}
```

## Date and time formatting

Use `datetime` for date/time values:

```json
{
  "purchase_date": [{
    "declarations": [
      "input date",
      "local formattedDate = date: datetime day=2-digit month=2-digit year=numeric"
    ],
    "match": {
      "date=*": "Purchase date: {formattedDate}."
    }
  }]
}
```

`datetime` forwards options to `Intl.DateTimeFormat`:

```json
{
  "event_start": [{
    "declarations": [
      "input date",
      "local formattedDate = date: datetime dateStyle=long timeStyle=short timeZone=UTC"
    ],
    "match": {
      "date=*": "Starts: {formattedDate}"
    }
  }]
}
```

> [!TIP]
> Use an explicit `timeZone` if output must be stable across environments.

## Relative time formatting

Use `relativetime` for relative durations such as past updates, upcoming deadlines, and "today"/"tomorrow" labels:

```json
{
  "last_seen": [{
    "declarations": [
      "input duration",
      "local formattedDuration = duration: relativetime unit=day numeric=auto"
    ],
    "match": {
      "duration=*": "Last seen {formattedDuration}."
    }
  }],
  "delivery_window": [{
    "declarations": [
      "input duration",
      "local formattedDuration = duration: relativetime unit=day"
    ],
    "match": {
      "duration=*": "Arrives {formattedDuration}."
    }
  }]
}
```

With an English locale, `last_seen({ duration: -1 })` can render "Last seen yesterday.", and `delivery_window({ duration: 2 })` can render "Arrives in 2 days." Negative values are in the past; positive values are in the future.

`unit` is required by Paraglide. It is not an `Intl.RelativeTimeFormatOptions` property because `Intl.RelativeTimeFormat` accepts the unit as a separate argument. Use a literal unit or a dynamic input with `$inputName`:

```json
{
  "relative_update": [{
    "declarations": [
      "input duration",
      "input unit",
      "local formattedDuration = duration: relativetime unit=$unit style=short"
    ],
    "match": {
      "duration=*,unit=*": "Updated {formattedDuration}."
    }
  }]
}
```

`relative_update({ duration: -3, unit: "hour" })` can render "Updated 3 hr. ago." Invalid dynamic units fail at runtime with the platform `Intl.RelativeTimeFormat` behavior.

Supported units are `year`, `quarter`, `month`, `week`, `day`, `hour`, `minute`, and `second`. Plural forms such as `days` are accepted by `Intl.RelativeTimeFormat`, but singular forms are recommended for consistency.

`relativetime` forwards supported `Intl.RelativeTimeFormatOptions` such as `localeMatcher`, `numeric`, and `style`:

```json
{
  "relative_calendar_day": [{
    "declarations": [
      "input duration",
      "local formattedDuration = duration: relativetime unit=day numeric=auto"
    ],
    "match": {
      "duration=*": "{formattedDuration}"
    }
  }],
  "relative_short_update": [{
    "declarations": [
      "input duration",
      "local formattedDuration = duration: relativetime unit=hour style=short"
    ],
    "match": {
      "duration=*": "Updated {formattedDuration}."
    }
  }]
}
```

With `numeric=auto`, `-1 day` can become "yesterday", `0 day` can become "today", and `1 day` can become "tomorrow".

Locale overrides work the same as other message calls:

```ts
import { m } from "./paraglide/messages.js";

m.last_seen({ duration: -1 }, { locale: "de" });
```

Paraglide formats the `(value, unit)` pair you pass. Automatic threshold selection is caller logic, so compute both values before calling the message:

```ts
import { m } from "./paraglide/messages.js";

function toRelativeDuration(minutes: number) {
  const absoluteMinutes = Math.abs(minutes);

  if (absoluteMinutes >= 60 * 24) {
    return {
      duration: Math.round(minutes / (60 * 24)),
      unit: "day",
    };
  }

  if (absoluteMinutes >= 60) {
    return {
      duration: Math.round(minutes / 60),
      unit: "hour",
    };
  }

  return {
    duration: minutes,
    unit: "minute",
  };
}

const relative = toRelativeDuration(-125);
m.relative_update(relative);
```

Paraglide uses the platform `Intl.RelativeTimeFormat`. Older runtimes need a polyfill.

## Locale changes and reactivity

Formatting runs when message functions are called. If locale changes, formatted values update the next time the message is evaluated.

```ts
import { m } from "./paraglide/messages.js";
import { setLocale } from "./paraglide/runtime.js";

setLocale("en");
m.personal_balance({ amount: 1000.57 }); // "Your balance is 1,000.57."

setLocale("de");
m.personal_balance({ amount: 1000.57 }); // "Your balance is 1.000,57."
```

By default, `setLocale()` reloads the page. If you pass `{ reload: false }`, trigger re-rendering with your framework's own reactivity.

See [Basics](./basics#getting-and-setting-the-locale) for details.

## Common mistakes

- Using `numberFormat`, `dateFormat`, or `relativeTimeFormat`:
  use `number`, `datetime`, or `relativetime`.
- Passing already formatted strings:
  pass raw values (`number` / `Date` / parseable date string) and let Paraglide format per locale.
- Expecting timezone-independent output without a timezone:
  set `timeZone=UTC` (or your target zone) in `datetime` options.
- Omitting `unit` for `relativetime`:
  provide a literal unit such as `unit=day` or a dynamic unit such as `unit=$unit`.
- Expecting `relativetime` to choose units automatically:
  compute the duration and unit in your app before calling the message.

## See also

- [Variants](./variants)
- [Translation File Formats](./file-formats)
- [Formatting example](https://github.com/opral/paraglide-js/tree/main/examples/formatting)
