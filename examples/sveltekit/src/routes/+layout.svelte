<script>
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { locales, localizeHref } from '$lib/paraglide/runtime';
</script>

<nav class="locale-switcher" aria-label="Languages">
	{#each locales as locale}
		<a href={resolve(localizeHref(page.url.pathname, { locale }))} data-sveltekit-reload>
			{locale}
		</a>
	{/each}
</nav>

<slot></slot>

<style>
	.locale-switcher {
		display: flex;
		gap: 0.75rem;
		margin: 0 0 1.5rem 0;
	}

	.locale-switcher a {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: 0.35rem 0.8rem;
		border: 1px solid #b8bcc2;
		border-radius: 999px;
		color: #111827;
		background: #f6f7f9;
		text-decoration: none;
		font-weight: 600;
		letter-spacing: 0.01em;
		transition: border-color 150ms ease, background 150ms ease,
			color 150ms ease;
	}

	.locale-switcher a:hover {
		border-color: #7c8a9a;
		background: #eef1f5;
	}

	.locale-switcher a:focus-visible {
		outline: 2px solid #0ea5e9;
		outline-offset: 2px;
	}
</style>
