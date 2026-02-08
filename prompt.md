I want to ship a markup api in paraglide js. here are convos, issues, and context. 


samuelstroschein
commented
3 weeks ago
From kmsomebody #3801 (comment):

Purely from a DX standpoint as a React dev, I think option 2 in your list of "Considered alternative APIs" comes closest to what I'd expect. Though what exactly would be the reason for overloading instead of adding the markup parameters to the first argument?

Let's take this message as an example:

"balance": "You have {#tooltip}{amount} coins{/tooltip}."
This message needs the amount parameter and a tooltip function.

Options such as per-message components (<m.balance.Rich/>), a new function (m.balance.rich() or m.balance.parts()) do not make sense to me, because the regular m.balance() function couldn't be used regardless. So that leads me to the question: Why can't I just use the m.balance() function for this too? There is always only one correct way to pass parameters to the message. I think having to use a different function or a component for different types of messages unnecessarily bloats the API. I'd always prefer a single entry point for this.

Suggestion
This suggestion is framework-specific, so the framework adapters would need to extend the compiler. I can only provide feedback for React. I do not know if it's possible to implement the same way for other frameworks.

The idea is to not overload the message function, but to change the type of its inputs and the return type depending on the message.
The return type for messages that do not contain markup placeholders is string. Otherwise, it's a ReactNode.
The input type for regular parameters stays unchanged, but the type for markup parameters is a React component.

Why ReactNode as return type is okay
The message function would only be used with placeholders in places where a ReactNode is expected. If the developer needs a string, they would not be able to use a component anyway, regardless of paraglide's support for it. If a string version and a rich text version are required, they can create two different messages.

Examples
I omitted the optional options parameter here, since it's not relevant.

Markup with children
"balance": "You have {#tooltip}{amount} coins{/tooltip}."
m.balance: (
  inputs: {
    amount: NonNullable<unknown>;
    tooltip: React.ComponentType<{ children: React.ReactNode }>;
  }
) => React.ReactNode;
Markup without children
"balance": "You have {amount} coins{#tooltip/}."
m.balance: (
  inputs: {
    amount: NonNullable<unknown>;
    tooltip: React.ComponentType<Record<never, never>>;
  }
) => React.ReactNode;
No markup
"balance": "You have {amount} coins."
m.balance: (
  inputs: {
    amount: NonNullable<unknown>;
  }
) => string;
This would provide the best DX for me.
No breaking changes and there is still only one message function generated per message.
Does this make sense?

@samuelstroschein samuelstroschein changed the title add rfc markup rfc 3 weeks ago
@samuelstroschein
Member
Author
samuelstroschein
commented
3 weeks ago
@kmsomebody thanks for the in-depth feedback.

I see the appeal of the API "just have one message function and let the compiler change return types as needed".

<p>{m.hello({ amount: 5 })}</p>
Two downsides:
1. Mixing inputs and markup risks namespace collisions
"balance": "You have {#amount}{amount} coins{/amount}."
// 💥 amount is not a react node
m.hello({ amount: 5 })
Question is: How often will that happen? Do we need to optimize for namespace collisions? After all, it can be linted via opral/lix#239.

Adding an overload for markup as 3rd argument kinda seems out of question. The API would get ugly.

m.hello({ amount: 5 }, {}, {amount: <Component />}
2. A compiler flag would be needed for the compiler
Seems OK tbh. Question is just if the message returning something like a Svelte|Solid|... etc. node works in all frameworks

options: {
+  framework: "react" | svelte | ...
}
@kmsomebody
kmsomebody
commented
2 weeks ago
1. Mixing inputs and markup risks namespace collisions
"balance": "You have {#amount}{amount} coins{/amount}."
// 💥 amount is not a react node
m.hello({ amount: 5 })
Question is: How often will that happen? Do we need to optimize for namespace collisions? After all, it can be linted via opral/lix#239.

Can the compiler detect that and throw? I think this should just be considered invalid.

---

# RFC: `parts()` API + `<Message>` rendering for markup placeholders

**Status:** Draft
**Goal:** Unblock safe, ergonomic markup / component interpolation in Paraglide JS

---

## Context

Many users want to use **markup placeholders** (bold, links, inline components) in translations without using raw HTML or `dangerouslySetInnerHTML`.

We already align on:

- **MessageFormat 2–style markup placeholders** (`{#b}…{/b}`, `{#icon/}`)
- Markup lives in the **inlang SDK AST**
- Translators control _where_ markup appears
- Rendering should be **safe by default** (no HTML parsing)

The open question is:
**What API should Paraglide JS expose?**

## Requirements

### Must have

- **Framework-agnostic compiler output**

  - No `.tsx`, `.vue`, or `.svelte` files generated

- **MessageFormat 2–derived model**

  - Start / end / standalone markup placeholders

- **Injection-safe**

  - Markup comes only from message patterns, not from interpolated values

- **`m.key()` keeps working**

  - Must still return a plain string for `title`, `aria-label`, logging, etc.

### Nice to have

- Simple mental model
- Works well for **React, Vue, and Svelte**
- Avoids per-message components or many imports
- Allows **strong typing** for required markup tags

## Proposed API

### 1) `message.parts()` (only for messages with markup)

For messages that contain markup placeholders, the generated message function additionally exposes:

```ts
m.contact();
m.contact.parts();
```

`parts()` returns a **framework-neutral array of parts**:

```ts
type MessagePart =
  | { type: "text"; value: string }
  | { type: "markupStart"; name: string }
  | { type: "markupEnd"; name: string }
  | { type: "markupStandalone"; name: string };
```

- Markup comes from the **message AST**
- Interpolated values are emitted as **text**, never re-parsed
- Messages **without markup do not get `parts()`**
- This keeps non-markup messages tree-shakable and minimal

### Markup semantics (important clarification)

- Markup placeholders are **wrappers**, not values
  (`{#b}text{/b}`, `{#link}…{/link}`)
- Therefore renderers receive **`children`** (the content inside the tag)
- **Nested markup is allowed** (e.g. `{#link}{#b}Text{/b}{/link}`)

> MessageFormat 2 allows markup but does not require tags to be hierarchical.
> **Paraglide will initially support only well-formed, properly nested markup**
> and treat crossing / invalid markup as a lint or build error.

Standalone tags (`{#icon/}`) do **not** receive `children`.

### 2) Framework-specific `<Message>` components (outside the compiler)

Rendering is handled by **framework adapters**, not by generated files:

- `@inlang/paraglide-js/react`
- `@inlang/paraglide-js/vue`
- `@inlang/paraglide-js/svelte`

Each adapter exports a single `<Message>` component.

### Rendering API shape

The rendering API uses a **`markup` prop**, not `components`, to emphasize that:

- Keys correspond to **markup placeholders defined in the message**
- Keys must **exactly match** the tag names used by the translator

Example message:

```json
{
  "contact": "Send {#link}an email{/link} and read the {#b}docs{/b}."
}
```

#### React

```tsx
<Message
  message={m.contact}
  inputs={{ email: "info@example.com" }}
  markup={{
    link: ({ children, inputs }) => (
      <a href={`mailto:${inputs.email}`}>{children}</a>
    ),
    b: ({ children }) => <strong>{children}</strong>,
  }}
/>
```

#### Vue

```vue
<Message :message="m.contact" :inputs="{ email: 'info@example.com' }">
  <template #link="{ children, inputs }">
    <a :href="`mailto:${inputs.email}`"><component :is="children" /></a>
  </template>
  <template #b="{ children }">
    <strong><component :is="children" /></strong>
  </template>
</Message>
```

#### Svelte

```svelte
<Message message={m.contact} inputs={{ email: "info@example.com" }}>
  {#snippet link({ children, inputs })}
    <a href={"mailto:" + inputs.email}>{children}</a>
  {/snippet}
  {#snippet b({ children })}
    <strong>{children}</strong>
  {/snippet}
</Message>
```

**Important:**

- No framework-specific files are generated by the compiler
- Adapters live in separate packages
- `markup` keys must match the exact tag names used in the message (type-checked)
- `children` represents the (possibly nested) content inside the markup tag

## Considered alternative APIs

### 1) `m.message.rich(...)`

```ts
m.contact.rich(inputs, { b: (chunks) => <b>{chunks}</b> });
```

**Pros**

- Very ergonomic in React

**Cons**

- Return type becomes framework-specific
- Hard to support Svelte cleanly
- Pushes compiler toward framework modes

### 2) Overloading the message function

```ts
m.contact({ email }, { markup: { b: fn } });
```

**Pros**

- Single entry point

**Cons**

- Ambiguous return type (string vs rich output)
- Harder typing and worse DX at scale

### 3) Per-message components (`m.contact.Rich`)

```tsx
<m.contact.Rich inputs={...} />
```

**Pros**

- Excellent DX and type safety

**Cons**

- Many generated exports
- Autocomplete noise
- Adds extra abstraction per message

### 4) Parsing the final string

```tsx
<Message str={m.contact(inputs)} />
```

**Pros**

- Looks simple

**Cons**

- Injection risks unless inputs are escaped
- Harder to lint and type-check
- Markup is detected too late

## Why Option B (`parts()` + `<Message>`)

- Keeps the **compiler framework-agnostic**
- Avoids bundle bloat for non-markup messages
- Clean security boundary
- Single, stable primitive (`parts()`)
- Framework-native rendering via adapters
- Strong typing tied to translator-defined markup
- Naturally supports nested markup via `children`

## Open questions (feedback welcome)

1. Is `parts()` the right low-level primitive?
2. Is `<Message>` the right primary API, or should we also expose a `renderMessage()` helper?
3. For missing markup mappings, should the default behavior be:

   - pass-through silently?
   - warn?
   - throw?



💡 Upvote and subscribe to this issue to increase prioritization.
Problem
Users can not use markup placeholders.

See this long thread https://github.com/opral/monorepo/discussions/1959#discussioncomment-8004920

And this one from https://discord.com/channels/897438559458430986/1110687789395226716/1110903944143712338:

CleanShot 2023-05-24 at 14 27 55@2x
Proposal
Add markup placeholders.

From the message format working group https://github.com/unicode-org/message-format-wg/blob/main/spec/syntax.md#markup-elements

CleanShot 2023-05-24 at 14 25 16@2x
Originally posted by @samuelstroschein in https://github.com/opral/monorepo/discussions/913

Activity
samuelstroschein
samuelstroschein commented on Mar 11, 2025
samuelstroschein
on Mar 11, 2025
Member
Author
We have a longer RFC. Feel free to comment on the Google Doc https://docs.google.com/document/d/1uhLrrwKPsenyNsDvZqCl6UXJc5ZBVQYkzn7k5yBuVy0/edit#heading=h.hv9mugtjvm53

samuelstroschein
samuelstroschein commented on Mar 28, 2025
samuelstroschein
on Mar 28, 2025
Member
Author
In the meantime you can directly write HTML in your messages and then call the message with dangeourslySetInnerHtml (react) or @html in Svelte

machycek
machycek commented on Mar 30, 2025
machycek
on Mar 30, 2025 · edited by machycek
This is the biggest blocker for us not switching over to paraglide. Hoping this lands at some point. Thanks for all the hard work 💯

gtbuchanan
gtbuchanan commented on Apr 4, 2025
gtbuchanan
on Apr 4, 2025 · edited by gtbuchanan
I'm providing my "injection safe" Vue implementation using the strategy from the OP's screenshot (and influenced by this) in hopes that it improves Paraglide JS adoption and guides the implementation of markup placeholders (i.e. component interpolation).

ParaglideM Functional Component
ParaglideM Usage
ParaglideM Tests
Notes
matt-winfield
matt-winfield commented on Apr 12, 2025
matt-winfield
on Apr 12, 2025 · edited by matt-winfield
I've created a similar component for React to allow replacing elements using a similar strategy as proposed in the OP screenshot.

Inspired by @gtbuchanan 's component for Vue, although the implementation/usage is a bit different.

Unfortunately it doesn't have strong typing for the elements (i.e. if you forget to include a tag in the list that is used in the translation it won't throw an error), and I haven't had time to thoroughly test the component. But this seems to work:

ParaglideM Component
Usage

samuelstroschein
mentioned this on May 31, 2025
Insert HTML in message paraglide-js#523
aarondoet
aarondoet commented on Jul 8, 2025
aarondoet
on Jul 8, 2025
This is the last thing I need for me to switch to inlang. I am currently using my own i18n implementation that I based off of typesafe-i18n, which I was using before. On my Svelte 5 version of it I am using it like this:

{
  "en": {
    "contact": "Feel free to send us <link href='mailto:{email}' text='an email'>!"
  },
  "de": {
    "contact": "Schreib uns gerne <link href='mailto:{email}' text='eine Email'>!"
  }
}
<I18n message={i18n.contact} args={{email: "info@example.com"}}>
  {#snippet link({href, text})}
    <A {href}>{text}</A> <!-- component from component library for default styling, just injecting html won't work for me -->
  {/snippet}
</I18n>
I do not have enough knowledge about inlang, I only tested it a bit and decided it to be better / more comfortable than my own solution, so I don't know how one could achieve this, nor do I want to hack together some weird solution.
The problem I have with solutions like that from @matt-winfield is that the inputs could inject something:

<ParaglideM message={m.greeting} inputs={{name: "[-bold]I don't want a bold name![+bold]"}} elements={{...}} />

samuelstroschein
transferred this issue fromopral/inlang-sdkon Jan 3
osdiab
osdiab commented on Jan 3
osdiab
on Jan 3 · edited by osdiab
Ive been just inserting a sentinel as the value for a variable in i18n strings, then split the resulting message on the sentinel and render the html where the hole is.

Like

const [before, after] = m["foo"]({ bar: SENTINEL }).split(SENTINEL);
return <>
  {before}<b>the content!</b>{after}
</>;
Can generalize this logic to handle arbitrary replacement of multiple sentinels. It’s jank but on the plus side, no dangerously setting HTML and full freedom of arbitrary react components with type safety (not tied to markup in i18n strings). If the content interpolated in is also an i18n string then it gets complicated to manage, though.

MCFreddie777
MCFreddie777 commented on Jan 5
MCFreddie777
on Jan 5
In Astro, I'm using it like this. Not ideal, using set:html, but since the translations are hardcoded, there is not risk of XSS injection.

  "section_description": "Lorem <strong class=\"font-semibold text-foreground\">ipsum</strong> dolor sit amet.",
<p
    class="text-center text-muted-foreground mb-16 text-lg max-w-3xl mx-auto"
    set:html={m.landing_page_benefits_section_description()}
 />
The only downfall is that templates live among the translations, would be better to pass rendered template inside the translation somehow.

mklnz
mklnz commented on Jan 7
mklnz
on Jan 7
This is definitely needed, especially for stuff like:

"Please share your <a href="">personalized link</a> in order to invite your friends"

The link may appear in different locations depending on the language...

osdiab
osdiab commented last month
osdiab
last month · edited by osdiab
Here is my helper React component btw for interpolating react nodes into i18n strings in a more declarative way

import escapeRegExp from 'escape-string-regexp';
import type { ReactNode } from "react";
import { useMemo } from "react";

type StringPlaceholderSlotProps = {
  toInterpolate: string;
  slotContent: Record<string, ReactNode>;
};

/**
 *
 * @param toInterpolate - The string to interpolate content where placeholder
 * names are present
 * @param slotContent - The content to insert into the placeholders, keyed by
 * placeholder names expected to be present in toInterpolate
 * @returns The string, with values interpolated; only the first match of each
 * placeholder is rendered; if a placeholder is not found in slotContent, it
 * will not be interpolated
 */
export function StringPlaceholderSlot({
  toInterpolate,
  slotContent,
}: StringPlaceholderSlotProps) {
  const parts = useMemo(() => {
    const parts: ReactNode[] = [];
    let remainingText = toInterpolate;
    const placeholdersToSearch = new Set<string>(Object.keys(slotContent));

    while (placeholdersToSearch.size > 0) {
      const match = new RegExp(
        `(${[...placeholdersToSearch].map((value) => escapeRegExp(value)).join("|")})`,
      ).exec(remainingText);
      if (match === null) {
        parts.push(<span>{remainingText}</span>);
        break;
      }
      const beforeMatch = remainingText.slice(0, match.index);
      const matchedPlaceholder = match[0];
      const afterMatch = remainingText.slice(match.index + match[0].length);
      parts.push(<span>{beforeMatch}</span>, slotContent[matchedPlaceholder]);
      remainingText = afterMatch;
      placeholdersToSearch.delete(matchedPlaceholder);
    }

    return <>{parts}</>;
  }, [toInterpolate, slotContent]);

  return <>{parts}</>;
}
osdiab
osdiab commented last month
osdiab
last month · edited by osdiab
and here's a version that actually makes the i18n interpolations typesafe. Intentionally throws away the types in the implementation because it was causing typescript to crawl to a halt with the size of our app; others who don't use radash and nanoid as well as the other utilities could adapt to not use them fairly simply.

import { identity, isPrimitive, objectKeys } from "@breezehr/utilities/object";
import escapeRegExp from 'escape-string-regexp';
import { nanoid } from "nanoid";
import { isEqual, mapValues, objectify, omit } from "radash";
import type { ReactNode } from "react";
import { memo } from "react";
import type { m } from "~gen/paraglide-i18n/messages";
import type { Locale, LocalizedString } from "~gen/paraglide-i18n/runtime";

export type I18nInterpolation<Key extends keyof typeof m> = {
  mFunction: (typeof m)[Key];
  inputs: Record<keyof Parameters<(typeof m)[Key]>[0], ReactNode>;
  options?: { locale?: Locale };
};

/**
 * Interpolates ReactNode content into an i18n localized string.
 *
 * @param i18nKey - The i18n message key to use for localization
 * @param inputs - The content to insert into the i18n message, similar to the
 * first param for the m function, but supports React components instead of just
 * strings. Primitive values are passed directly to the i18n function, while
 * ReactNode values are replaced with placeholders and then interpolated into
 * the rendered output.
 * @param options - Optional localization options (e.g., locale); same as the
 * second param for the m function.
 * @returns The localized string with dynamic values interpolated in
 */
function I18nInterpolationImpl<Key extends keyof typeof m>({
  mFunction,
  inputs,
  options,
}: I18nInterpolation<Key>) {
  const inputsWithoutTypes: Record<string, ReactNode> = inputs;
  const resolvedInputs = objectify(
    objectKeys(inputsWithoutTypes),
    identity,
    (
      key,
    ):
      | { interpolateAsIs: true; contentOrPlaceholder: ReactNode }
      | {
          interpolateAsIs: false;
          contentOrPlaceholder: string;
          toReplaceWith: ReactNode;
        } => {
      const inputValue = inputsWithoutTypes[key];
      if (isPrimitive(inputValue)) {
        return { interpolateAsIs: true, contentOrPlaceholder: inputValue };
      }
      const placeholder = nanoid();
      return {
        interpolateAsIs: false,
        contentOrPlaceholder: placeholder,
        toReplaceWith: inputsWithoutTypes[key],
      };
    },
  );

  // intentionally stripping types to avoid typescript performance issues
  // since m is so huge
  const paramsWithoutTypes: unknown[] = [
    mapValues(resolvedInputs, (value) => value.contentOrPlaceholder),
    options,
  ];
  const mFunctionWithoutTypes: (..._arguments: unknown[]) => LocalizedString =
    mFunction;
  const localizedStringWithPlaceholders = mFunctionWithoutTypes(
    ...paramsWithoutTypes,
  );

  const inputsToReplace = Object.fromEntries(
    Object.entries(resolvedInputs)
      .map(([key, value]) =>
        value.interpolateAsIs ? null : ([key, value] as const),
      )
      .filter(value => value !== null),
  );
  const replacementsByPlaceholder = objectify(
    Object.entries(inputsToReplace),
    ([, value]) => value.contentOrPlaceholder,
    ([, value]) => value.toReplaceWith,
  );
  const parts: ReactNode[] = [];
  let remainingText: string = localizedStringWithPlaceholders;
  const placeholdersToSearch = new Set<string>(
    Object.keys(replacementsByPlaceholder),
  );

  while (placeholdersToSearch.size > 0) {
    const match = new RegExp(
      `(${[...placeholdersToSearch].map((value) => escapeRegExp(value)).join("|")})`,
    ).exec(remainingText);
    if (match === null) {
      parts.push(<span>{remainingText}</span>);
      break;
    }
    const beforeMatch = remainingText.slice(0, match.index);
    const matchedPlaceholder = match[0];
    const afterMatch = remainingText.slice(match.index + match[0].length);
    parts.push(
      <span>{beforeMatch}</span>,
      replacementsByPlaceholder[matchedPlaceholder],
    );
    remainingText = afterMatch;
    placeholdersToSearch.delete(matchedPlaceholder);
  }

  // Add any remaining text after all placeholders have been matched
  if (remainingText.length > 0) {
    parts.push(<span>{remainingText}</span>);
  }

  return <>{parts}</>;
}

export const I18nInterpolation = memo(
  I18nInterpolationImpl,
  (previous, next) =>
    isEqual(
      omit(previous, ["inputs", "options"]),
      omit(next, ["inputs", "options"]),
    ) &&
    isEqual(previous.inputs, next.inputs) &&
    isEqual(previous.options, next.options),
);
you will also need an override of the default React memo() typings because they don't support generics out of box:

// interfaces useful for declaration merging
/* eslint-disable @typescript-eslint/consistent-type-definitions */
/**
 * memo doesn't work by default with inferred generics, this fixes
 * that
 * @see https://github.com/DefinitelyTyped/DefinitelyTyped/issues/37087#issuecomment-937905781
 */

import "react";

declare module "react" {
  // biome-ignore lint/suspicious/noExplicitAny: we want a very general generic
  function memo<T extends ComponentType<any>>(
    Component: T,
    propsAreEqual?: (
      // eslint-disable-next-line unicorn/prevent-abbreviations
      prevProps: Readonly<ComponentProps<T>>,
      nextProps: Readonly<ComponentProps<T>>,
    ) => boolean,
  ): T & { displayName?: string | undefined };
}

samuelstroschein
samuelstroschein commented last month
samuelstroschein
last month · edited by samuelstroschein
Member
Author
Please give feedback on the RFC on how to implement this in Paraglide JS. Please discuss in #4309

If there is strong consensus about the proposed API, I can ship markup this week.
Best to inline comment on the RFC or comment on this github issue
kmsomebody
kmsomebody commented 3 weeks ago
kmsomebody
3 weeks ago · Hidden as duplicate

samuelstroschein
mentioned this 3 weeks ago
markup rfc #4309

samuelstroschein
mentioned this last week
Support Rich Text Formatting - Useful for controlling the style of a word to be bold for instance paraglide-js#606
TiagoPortfolio
TiagoPortfolio commented 5 hours ago
TiagoPortfolio
5 hours ago
I think this is the main feature that prevents people from shifting from other locales solutions to inlang or praglidejs.

Here is a simple example:

en.json

{
  "welcome_user": "Welcome {username}!",
}
index.tsx

{m.welcome_user({
  username: () => <strong>{user.username}</strong>
})}



Seems great!
But Paraglide we will have to make packages for each framework? I really like the idea of being agnostic
But if the render happens by the framework and I can infer the types in the compiler with an option (or predefined like "react" | "solid") it is fine
If I want to compile the paraglide to use with plain Javascript and markup somehow would it great (just don't want to get trapped in any framework)