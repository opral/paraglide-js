---
title: SvelteKit i18n - The Official Internationalization Solution
description: Paraglide JS is SvelteKit's officially recommended i18n library. Add type-safe translations, localized URLs, and SEO-friendly multi-language support with up to 70% smaller i18n bundle sizes.
image: https://cdn.jsdelivr.net/gh/opral/paraglide-js@latest/examples/sveltekit/sveltekit-banner.png
---

<img src="https://cdn.jsdelivr.net/gh/opral/paraglide-js@latest/examples/sveltekit/sveltekit-banner.png" alt="i18n library for SvelteKit" width="10000000px" />

Paraglide JS is SvelteKit's [official i18n integration](https://svelte.dev/docs/cli/paraglide).

It's a compiler-based i18n library that emits tree-shakable translations, leading to up to 70% smaller i18n bundle sizes compared to runtime based libraries.

- Fully type-safe with IDE autocomplete
- SEO-friendly localized URLs with the [i18n routing strategy](https://inlang.com/m/gerre34r/library-inlang-paraglideJs/strategy#url)
- Works with CSR, SSR, and SSG

[Source code](https://github.com/opral/paraglide-js/tree/main/examples/sveltekit)

## Getting started

### Install paraglide js

```bash
npx @inlang/paraglide-js@latest init
```

### Add the `paraglideVitePlugin()` to `vite.config.js`.

> [!NOTE]
> You can define strategy however you need.

```diff
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
+import { paraglideVitePlugin } from '@inlang/paraglide-js';

export default defineConfig({
	plugins: [
		sveltekit(),
+		paraglideVitePlugin({
+			project: './project.inlang',
+			outdir: './src/lib/paraglide',
+			strategy: ['url', 'cookie', 'baseLocale'],
+		})
	]
});
```

### Add `%lang%` and `%dir%` to `src/app.html`.

See https://svelte.dev/docs/kit/accessibility#The-lang-attribute for more information.

```diff
<!doctype html>
-<html lang="en">
+<html lang="%lang%" dir="%dir%">
	...
</html>
```

### Add the `paraglideMiddleware()` to `src/hooks.server.ts`

```typescript
import type { Handle } from '@sveltejs/kit';
import { paraglideMiddleware } from '$lib/paraglide/server';
import { getTextDirection } from '$lib/paraglide/runtime';

// creating a handle to use the paraglide middleware
const paraglideHandle: Handle = ({ event, resolve }) =>
	paraglideMiddleware(event.request, ({ request: localizedRequest, locale }) => {
		event.request = localizedRequest;
		return resolve(event, {
			transformPageChunk: ({ html }) => {
				return html
					.replace('%lang%', locale)
					.replace('%dir%', getTextDirection(locale));
			}
		});
	});

export const handle: Handle = paraglideHandle;
```

### Add a reroute hook in `src/hooks.ts`

IMPORTANT: The `reroute()` function must be exported from the `src/hooks.ts` file, not `src/hooks.server.ts`.

```typescript
import type { Reroute } from '@sveltejs/kit';
import { deLocalizeUrl } from '$lib/paraglide/runtime';

export const reroute: Reroute = (request) => {
	return deLocalizeUrl(request.url).pathname;
};
```

## Usage

```js
import { m } from '$lib/paraglide/messages.js';
import { getLocale, setLocale } from '$lib/paraglide/runtime.js';

// Use messages
m.greeting({ name: 'World' }); // "Hello World!"

// Get and set locale
getLocale(); // "en"
setLocale('de'); // switches to German
```

[Learn more about messages, parameters, and locale management →](/m/gerre34r/library-inlang-paraglideJs/basics)

## Static site generation (SSG)

Enable [pre-renderering](https://svelte.dev/docs/kit/page-options#prerender) by adding the following line to `routes/+layout.ts`:

```diff
// routes/+layout.ts
+export const prerender = true;
```

Then add a locale switcher in `routes/+layout.svelte` to generate all pages during build time. SvelteKit crawls anchor tags during the build and is, thereby, able to generate all pages statically. If you already have a visible locale switcher that links to every locale variant, nothing extra is required. Add `data-sveltekit-reload` (see [paraglide-js#472](https://github.com/opral/paraglide-js/issues/472)) so locale switches trigger a full reload and the new locale is applied.

```diff
<script>
	import { page } from '$app/state';
	import { locales, localizeHref } from '$lib/paraglide/runtime';
</script>

<nav class="locale-switcher" aria-label="Languages">
	{#each locales as locale}
		<a href={localizeHref(page.url.pathname, { locale })} data-sveltekit-reload>
			{locale}
		</a>
	{/each}
</nav>

<slot></slot>
```

If you use the static adapter with `ssr = false` (SPA mode), make asset paths absolute to avoid locale-prefixed 404s (see [paraglide-js#503](https://github.com/opral/paraglide-js/issues/503)):

```diff
// svelte.config.js
import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

const config = {
	preprocess: vitePreprocess(),
	kit: {
		adapter: adapter(),
+		paths: {
+			relative: false
+		}
	}
};

export default config;
```

## Troubleshooting

### Disabling AsyncLocalStorage in serverless environments

If you're deploying to SvelteKit's Edge adapter like Vercel Edge or Cloudflare Pages, you can disable AsyncLocalStorage to avoid issues with Node.js dependencies not available in those environments:

> [!WARNING]
> Only use this option in serverless environments where each request gets its own isolated runtime context. Using it in multi-request server environments could lead to data leakage between concurrent requests.

```diff
// vite.config.js
export default defineConfig({
	plugins: [
		sveltekit(),
		paraglideVitePlugin({
			project: './project.inlang',
			outdir: './src/lib/paraglide',
+			disableAsyncLocalStorage: true
		})
	]
});
```

### No locale OR different locale when calling messages outside of .server.ts files

If you call messages on the server outside of load functions or hooks, you might run into issues with the locale not being set correctly. This can happen if you call messages outside of a request context.

```typescript
// hello.ts
import { m } from './paraglide/messages.js';

// 💥 there is no url in this context to retrieve
//    the locale from.
console.log(m.hello());
```
