<script lang="ts">
	import { m } from "./paraglide/messages.js";
	import ParaglideMessage from "./Message.svelte";
</script>

<ParaglideMessage message={m.nested_cta} inputs={{}}>
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
</ParaglideMessage>
