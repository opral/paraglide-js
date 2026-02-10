Svelte component for rendering [Paraglide JS](https://github.com/opral/paraglide-js) messages that contain markup.

Given this message in your source file (for example `messages/en.json`):

```json
{
	"cta": "{#link to=/docs}Read docs{/link}"
}
```

```svelte
<script lang="ts">
	import { ParaglideMessage } from "@inlang/paraglide-js-svelte";
	import { m } from "./paraglide/messages.js";
	import CustomLink from "./CustomLink.svelte";
</script>

<ParaglideMessage message={m.cta} inputs={{}}>
	{#snippet link({ children, options })}
		<CustomLink to={options.to}>
			{@render children?.()}
		</CustomLink>
	{/snippet}
</ParaglideMessage>
```

`<ParaglideMessage />` uses `message.parts()` when present and falls back to
`message()` for plain-text messages.
