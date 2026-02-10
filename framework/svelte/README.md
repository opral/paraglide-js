# @inlang/paraglide-js-svelte

Svelte adapter package for Paraglide JS.

Given this message in your source file (for example `messages/en.json`):

```json
{
	"cta": "{#link to=/docs}Read docs{/link}"
}
```

```svelte
<script lang="ts">
	import { Message } from "@inlang/paraglide-js-svelte";
	import { m } from "./paraglide/messages.js";
	import CustomLink from "./CustomLink.svelte";
</script>

<Message message={m.cta} inputs={{}}>
	{#snippet link({ children, options })}
		<CustomLink to={options.to}>
			{@render children?.()}
		</CustomLink>
	{/snippet}
</Message>
```

`<Message />` uses `message.parts()` when present and falls back to `message()`
for plain-text messages.
