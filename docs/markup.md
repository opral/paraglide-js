---
title: Markup
description: Render rich text in Paraglide JS messages with type-safe markup placeholders and framework adapters.
---

# Markup

Markup lets translators control where emphasis, links, and inline UI appear, while your app controls how those tags render.

> [!NOTE]
> The syntax below uses `@inlang/plugin-message-format`. If you use another plugin, markup syntax can differ.

> [!IMPORTANT]
> Markup tag names are not predefined HTML tags. Names like `link`, `strong`, `b`, or `icon` are arbitrary, app-defined identifiers.
> Paraglide does not automatically render `{#b}...{/b}` as `<b>...</b>` or `{#link}...{/link}` as `<a>...</a>`.
> You choose how each tag name renders in your framework.

## Write markup in messages

`messages/en.json`

```json
{
	"hello": "Hello {name}",
	"cta": "{#link to=|/docs| @track}Read docs{/link}",
	"nested_cta": "{#link to=|/docs|}{#strong}Read docs{/strong}{/link}"
}
```

- `link` and `strong` are markup tag names.
- `to=|/docs|` is an option, available as `options.to`.
- `@track` is a boolean attribute, available as `attributes.track === true`.

## Syntax reference

The examples on this page use the syntax from [`@inlang/plugin-message-format`](https://inlang.com/m/reootnfj/plugin-inlang-messageFormat#markup-placeholders-rich-text).

- `{#tag}...{/tag}` creates a wrapping markup tag. It is exposed as `markup.tag` and receives `children`.
- `{#tag/}` creates a standalone markup tag. It is exposed as `markup.tag` without children.
- `name=|literal|` sets a literal option value. It is exposed as `options.name`.
- `name=$variable` sets a variable option value. It is exposed as `options.name`.
- `@track` sets a boolean attribute. It is exposed as `attributes.track === true`.
- `@variant=|hero|` sets a literal-valued attribute. It is exposed as `attributes.variant === "hero"`.

Options and attributes are both metadata attached to a tag, but they are exposed separately:

- Use `options.*` for data your renderer needs, such as `href`, `rel`, or an icon name.
- Use `attributes.*` for flags or annotations such as `track`, `variant`, or `decorative`.

For `@inlang/plugin-message-format`, options support both literal values and `$variable` references. Attributes support boolean values and literal values.

## What gets rendered

Paraglide keeps `message()` returning plain strings.
When markup exists, compiled messages also expose `message.parts()`, and framework components use that automatically.

```json
{
	"welcome": "{#b}Hi {name}{/b}{#icon/}"
}
```

```ts
m.welcome({ name: "Ada" });
// "Hi Ada"
```

`message()` strips markup wrappers. To render markup, provide renderers/snippets for the tag names you used in the message:

```tsx
<ParaglideMessage
	message={m.welcome}
	inputs={{ name: "Ada" }}
	markup={{
		b: ({ children }) => <b>{children}</b>,
		icon: () => <span aria-hidden="true" className="icon-wave" />,
	}}
/>
```

In other words:

- `{#b}...{/b}` gives you a renderer key named `b`.
- `{#icon/}` gives you a renderer key named `icon`.
- Nothing is mapped to HTML automatically.

## Render markup in your framework

Framework adapters call `message.parts()` and look up renderers/snippets by tag name.
If your message uses `{#link}...{/link}`, you provide `link`.
If your message uses `{#b}...{/b}`, you provide `b`.

### React

Package: [`@inlang/paraglide-js-react`](https://www.npmjs.com/package/@inlang/paraglide-js-react)

```tsx
import { ParaglideMessage } from "@inlang/paraglide-js-react";
import { m } from "./paraglide/messages.js";

export function ContactCta() {
	return (
		<ParaglideMessage
			message={m.cta}
			inputs={{}}
			markup={{
				link: ({ children, options, attributes }) => (
					<a
						href={options.to}
						data-track={attributes.track === true ? "true" : "false"}
					>
						{children}
					</a>
				),
			}}
		/>
	);
}
```

### Vue

Package: [`@inlang/paraglide-js-vue`](https://www.npmjs.com/package/@inlang/paraglide-js-vue)

Most Vue apps use templates, so this is the recommended shape:

```vue
<script setup lang="ts">
import { ParaglideMessage } from "@inlang/paraglide-js-vue";
import { h } from "vue";
import { m } from "./paraglide/messages.js";

const markup = {
	link: ({ children, options }) => h("a", { href: options.to }, children),
};
</script>

<template>
	<ParaglideMessage :message="m.cta" :inputs="{}" :markup="markup" />
</template>
```

### Svelte

Package: [`@inlang/paraglide-js-svelte`](https://www.npmjs.com/package/@inlang/paraglide-js-svelte)

```svelte
<script lang="ts">
	import { ParaglideMessage } from "@inlang/paraglide-js-svelte";
	import { m } from "./paraglide/messages.js";
</script>

<ParaglideMessage message={m.cta} inputs={{}}>
	{#snippet link({ children, options })}
		<a href={options.to}>
			{@render children?.()}
		</a>
	{/snippet}
</ParaglideMessage>
```

### Solid

Package: [`@inlang/paraglide-js-solid`](https://www.npmjs.com/package/@inlang/paraglide-js-solid)

```tsx
import { ParaglideMessage } from "@inlang/paraglide-js-solid";
import { m } from "./paraglide/messages.js";

const view = (
	<ParaglideMessage
		message={m.cta}
		inputs={{}}
		markup={{
			link: ({ children, options }) => <a href={options.to}>{children}</a>,
		}}
	/>
);
```

## Low-level API: `message.parts()`

If you want custom rendering, use `parts()` directly:

```ts
const parts = m.cta.parts({});
/*
[
  { type: "markup-start", name: "link", options: { to: "/docs" }, attributes: { track: true } },
  { type: "text", value: "Read docs" },
  { type: "markup-end", name: "link", options: { to: "/docs" }, attributes: { track: true } }
]
*/
```

`MessagePart` entries are framework-neutral:

- `text`
- `markup-start`
- `markup-end`
- `markup-standalone`

The tag names, options, and attributes in `parts()` come directly from the message:

```ts
const parts = m.welcome.parts({ name: "Ada" });
/*
[
  { type: "markup-start", name: "b", options: {}, attributes: {} },
  { type: "text", value: "Hi " },
  { type: "text", value: "Ada" },
  { type: "markup-end", name: "b", options: {}, attributes: {} },
  { type: "markup-standalone", name: "icon", options: {}, attributes: {} }
]
*/
```

## Where do available tags come from?

There is no global list of built-in tags.

- Tag names come from the message itself, for example `{#link}` and `{#strong}`.
- Option names come from whatever you attach to that tag, for example `to=|/docs|`.
- Attribute names come from whatever you attach with `@`, for example `@track` or `@variant=|hero|`.

Paraglide uses those names to generate type-safe renderer/snippet props for each message.
That is why IDE autocomplete shows the names you used in your message rather than a fixed built-in registry.

## Type safety and fallback behavior

- For messages with markup, `markup` renderers/snippets are required and tag names are type-checked.
- For plain messages, `markup` props are rejected by TypeScript.
- `message()` still returns plain text (markup wrappers are stripped).
- If a renderer for a wrapping tag is missing, children are still rendered.
- If a renderer for a standalone tag is missing, nothing is rendered for that tag.

## FAQ

### Are tags predefined?

No. With `@inlang/plugin-message-format`, `{#whatever}Some text{/whatever}` is valid.

### Will `{#b}...{/b}` automatically render as `<b>...</b>`?

No. You still provide the renderer/snippet for `b`.

### Where can I find the list of available tags, options, and attributes?

In the message itself, in `message.parts()`, and in the generated TypeScript types for the `markup` prop/snippets.
