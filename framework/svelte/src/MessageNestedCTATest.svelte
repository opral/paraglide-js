<script lang="ts">
	import { m } from "./paraglide/messages.js";
	import Message from "./Message.svelte";
</script>

<Message message={m.nested_cta} inputs={{}}>
	{#snippet link({ children, options })}
		<a href={options.to}>
			{@render children?.()}
		</a>
	{/snippet}
	{#snippet strong({ children })}
		<strong>
			{@render children?.()}
		</strong>
	{/snippet}
</Message>
