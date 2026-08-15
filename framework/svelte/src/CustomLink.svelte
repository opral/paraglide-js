<script lang="ts">
	import type { Snippet } from "svelte";

	const {
		children,
		to,
		track,
	}: {
		children?: Snippet;
		to: string;
		track?: boolean;
	} = $props();
</script>

<a href={to} data-track={track}>
	🔗 {@render children?.()}
</a>
