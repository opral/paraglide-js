---
title: Variants
description: Pluralization, gendering, A/B testing, and conditional messages in Paraglide.
---

# Variants

Variants enable pluralization, gendering, A/B testing, and more. They are a powerful feature of inlang that allows you to create different versions of a message based on conditions.

> [!TIP]
> Need locale-aware number/date formatting (`number`, `datetime`)? See [Formatting](./formatting).

## Matching

The message below will match the following conditions:

| Platform | User Gender | Message                                                                 |
|----------|-------------|-------------------------------------------------------------------------|
| android  | male        | {username} has to download the app on his phone from the Google Play Store. |
| ios      | female      | {username} has to download the app on her iPhone from the App Store.    |
| *        | *           | The person has to download the app.                                     |

> [!NOTE]
> The example below uses the inlang message format plugin for illustrative purposes. The syntax may differ depending on the plugin you are using.

```json
{
	"jojo_mountain_day": [{
		"match": {
			"platform=android, userGender=male": "{username} has to download the app on his phone from the Google Play Store.",
			"platform=ios, userGender=female": "{username} has to download the app on her iPhone from the App Store.",
			"platform=*, userGender=*": "The person has to download the app."
		}
	}]
}
```

### Variant preference

When more than one variant matches, Paraglide picks one the way MessageFormat 2 does: selectors are compared in the order they are declared, and for each selector a variant with a literal key is preferred over a variant with the catchall `*`. The order in which variants are stored does not matter.

For example, with the selectors `platform, userGender` and the variants `platform=*, userGender=male`, `platform=android, userGender=*` and `platform=*, userGender=*`, the input `platform=android, userGender=male` selects `platform=android, userGender=*`, because the first selector, `platform`, has a literal match there.

## Pluralization

You can define a variable in your message and then use it in the selector. Paraglide uses `Intl.PluralRules` under the hood to determine the plural form. 

| Inputs  | Condition         | Message                |
|---------|-------------------|------------------------|
| count=1 | countPlural=one   | There is one cat.      |
| count>1 | countPlural=other | There are many cats.   |

> [!TIP]
> Read the `local countPlural = count: plural` syntax as "create a local variable `countPlural` that equals `plural(count)`".

```json
{
"some_happy_cat": [{
    "declarations": ["input count", "local countPlural = count: plural"],
    "selectors": ["countPlural"],
    "match": {
      "countPlural=one": "There is one cat.",
      "countPlural=other": "There are many cats.",
    },
  }]
}
```

### Exact numbers (`=0`, `=1`, …)

A plural selector returns a category (`zero`, `one`, `two`, `few`, `many`, `other`), never a number. A key like `0` on the `countPlural` selector itself therefore never matches. To match an exact number, add a second selector that aliases the input without a function, and put it **before** the plural selector, so the exact match wins over a category like French `one`, which also covers 0:

```json
{
"some_happy_cat": [{
    "declarations": [
      "input count",
      "local countPluralExact = count",
      "local countPlural = count: plural"
    ],
    "selectors": ["countPluralExact", "countPlural"],
    "match": {
      "countPluralExact=0, countPlural=*": "There are no cats.",
      "countPluralExact=*, countPlural=one": "There is one cat.",
      "countPluralExact=*, countPlural=*": "There are {count} cats."
    }
  }]
}
```

This is the shape the ICU MessageFormat 1 plugin imports `{count, plural, =0 {…} one {…} other {…}}` as. A numeric key on an alias of an input matches both the number `0` and the string `"0"`.

> [!NOTE]
> Un-annotated locals like `local countPluralExact = count` need a message format plugin version that supports them ([opral/inlang#4440](https://github.com/opral/inlang/pull/4440)). Older versions also sort selectors alphabetically on export, which puts `countPlural` before `countPluralExact`, so the exact match loses to a category that also covers the number.

### Plural offset

`plural` accepts an `offset` option, which ICU MessageFormat 1 `{count, plural, offset:1 …}` imports as `local countPluralOffset1 = count: plural offset=1`. The category is selected for `count - offset`, while exact numbers like `=1` still compare `count` itself. With `offset=1` in English, `count` 2 selects `one` and `count` 3 selects `other`.

### Ordinal pluralization (1st, 2nd, 3rd…)

`plural` forwards its options to `Intl.PluralRules`, so you can request ordinal categories by passing `type=ordinal`.

```json
{
  "finished_readout": [{
    "declarations": [
      "input placeNumber",
      "local ordinalCategory = placeNumber: plural type=ordinal"
    ],
    "selectors": ["ordinalCategory"],
    "match": {
      "ordinalCategory=one": "You finished in {placeNumber}st place",
      "ordinalCategory=two": "You finished in {placeNumber}nd place",
      "ordinalCategory=few": "You finished in {placeNumber}rd place",
      "ordinalCategory=*": "You finished in {placeNumber}th place"
    }
  }]
}
```

> [!TIP]
> Ordinal category names (`one`, `two`, `few`, `other`, etc.) follow `Intl.PluralRules` for the active locale.
