---
title: Markup
description: Render rich text in Paraglide JS messages with type-safe markup placeholders and framework adapters.
---

# Markup

Markup lets translators control where emphasis, links, and inline UI appear, while your app controls how those tags render.

> [!NOTE]
> The syntax below uses `@inlang/plugin-message-format`. If you use another plugin, markup syntax can differ.

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

## Render markup in your framework

Paraglide keeps `message()` returning plain strings.
When markup exists, compiled messages also expose `message.parts()`, and framework components use that automatically.

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

## Type safety and fallback behavior

- For messages with markup, `markup` renderers/snippets are required and tag names are type-checked.
- For plain messages, `markup` props are rejected by TypeScript.
- `message()` still returns plain text (markup wrappers are stripped).
- If a renderer for a wrapping tag is missing, children are still rendered.
- If a renderer for a standalone tag is missing, nothing is rendered for that tag.
