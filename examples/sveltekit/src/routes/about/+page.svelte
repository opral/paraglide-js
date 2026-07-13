<script lang="ts">
	import { resolve } from '$app/paths';
	import { localizeHref } from '$lib/paraglide/runtime';
	import { m } from '$lib/paraglide/messages';
</script>

<p>{m.about()}</p>

<a href={resolve(localizeHref('/') as '/')}>go back to home</a>
