<script lang="ts">
	import { m } from "./paraglide/messages.js";
	import ParaglideMessage from "./Message.svelte";
	import CustomLink from "./CustomLink.svelte";
</script>

<ParaglideMessage message={m.cta} inputs={{}}>
	{#snippet link({ children, options, attributes })}
		<CustomLink to={options.to} track={attributes.track}>
			{@render children?.()}
		</CustomLink>
	{/snippet}
</ParaglideMessage>
