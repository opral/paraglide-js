---
title: Formatting
description: Locale-aware number and date formatting in Paraglide JS using message declarations.
---

# Formatting

Paraglide supports locale-aware formatting in message declarations when you use the **inlang message format plugin**.

Built-in formatter names:

- `plural` (uses `Intl.PluralRules`)
- `number` (uses `Intl.NumberFormat`)
- `datetime` (uses `Intl.DateTimeFormat`)

> [!NOTE]
> The formatter names are exactly `plural`, `number`, and `datetime`.

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

- Using `numberFormat` or `dateFormat`:
  use `number` and `datetime`.
- Passing already formatted strings:
  pass raw values (`number` / `Date` / parseable date string) and let Paraglide format per locale.
- Expecting timezone-independent output without a timezone:
  set `timeZone=UTC` (or your target zone) in `datetime` options.

## See also

- [Variants](./variants)
- [Translation File Formats](./file-formats)
- [Formatting example](https://github.com/opral/paraglide-js/tree/main/examples/formatting)
