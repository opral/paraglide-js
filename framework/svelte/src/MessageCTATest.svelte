<script lang="ts">
	import { m } from "./paraglide/messages.js";
	import ParaglideMessage from "./Message.svelte";
</script>

<ParaglideMessage message={m.cta} inputs={{}}>
	{#snippet link({ children, options, attributes })}
		<a href={options.to} data-track={attributes.track}>
			{@render children?.()}
		</a>
	{/snippet}
</ParaglideMessage>
