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
