<script lang="ts" generics="TMessage extends MessageLike<any, any, any>">
	import { renderMessage } from "./message.js";
	import type {
		Child,
		MessageLike,
		MessageMarkupProps,
		MessageProps,
	} from "./message.js";

	const { message, inputs, options, ...rest }: MessageProps<TMessage> = $props();
	const markup = rest as unknown as MessageMarkupProps<TMessage>;

	const parts = $derived.by(() =>
		renderMessage({
			message,
			inputs,
			options,
			...markup,
		})
	);
</script>

{#snippet renderChildren(children: Child<typeof inputs>[])}
	{#each children as child}
		{#if typeof child === "string"}
			{child}
		{:else}
			{#snippet childrenSnippet()}
				{@render renderChildren(child.children)}
			{/snippet}
			{@render child.snippet({
				options: child.options,
				attributes: child.attributes,
				inputs,
				messageOptions: options,
				children: childrenSnippet,
			})}
		{/if}
	{/each}
{/snippet}

{@render renderChildren(parts)}
