<script lang="ts">
	import { m } from "./paraglide/messages.js";
	import Message from "./Message.svelte";
	import CustomLink from "./CustomLink.svelte";
</script>

<Message message={m.cta} inputs={{}}>
	{#snippet link({ children, options, attributes })}
		<CustomLink to={options.to} track={attributes.track}>
			{@render children?.()}
		</CustomLink>
	{/snippet}
</Message>
