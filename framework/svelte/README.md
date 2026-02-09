# @inlang/paraglide-js-svelte

Svelte adapter package for Paraglide JS.

```svelte
<script lang="ts">
	import { Message } from "@inlang/paraglide-js-svelte";
	import { m } from "./paraglide/messages.js";
</script>

<Message
	message={m.cta}
	inputs={{}}
	markup={{
		link: ({ children, options }) => `<a href="${options.to}">${children ?? ""}</a>`,
	}}
/>
```

`<Message />` uses `message.parts()` when present and falls back to `message()`
for plain-text messages. A lower-level `renderMessage(...)` helper is also
exported for non-component usage.
