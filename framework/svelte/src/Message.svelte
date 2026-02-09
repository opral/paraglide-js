<script lang="ts">
	import { renderMessage } from "./message.js";
	import type { MessageLike, MessageProps } from "./message.js";

	export let message: MessageLike<any, any, any>;
	export let inputs: Record<string, unknown>;
	export let options: MessageProps<MessageLike<any, any, any>>["options"] | undefined =
		undefined;
	export let markup: MessageProps<MessageLike<any, any, any>>["markup"] | undefined =
		undefined;
	let html = "";

	$: html = renderMessage({
		message,
		inputs,
		options,
		markup,
	} as MessageProps<MessageLike<any, any, any>>);
</script>

{@html html}
