---
title: SvelteKit i18n - The Official Internationalization Solution
description: Paraglide JS is SvelteKit's officially recommended i18n library. Add type-safe translations, localized URLs, and SEO-friendly multi-language support with up to 70% smaller i18n bundle sizes.
image: https://cdn.jsdelivr.net/gh/opral/paraglide-js@latest/examples/sveltekit/sveltekit-banner.png
---

<img src="https://cdn.jsdelivr.net/gh/opral/paraglide-js@latest/examples/sveltekit/sveltekit-banner.png" alt="i18n library for SvelteKit" width="10000000px" />

Paraglide JS is SvelteKit's [official i18n integration](https://svelte.dev/docs/cli/paraglide).

It's a compiler-based i18n library that emits tree-shakable translations, leading to up to 70% smaller i18n bundle sizes compared to runtime based libraries.

- Fully type-safe with IDE autocomplete
- SEO-friendly localized URLs with the [i18n routing strategy](https://paraglidejs.com/strategy#url)
- Works with CSR, SSR, and SSG

[Source code](https://github.com/opral/paraglide-js/tree/main/examples/sveltekit)

## Getting started

### Via the [Svelte CLI](https://svelte.dev/docs/cli/paraglide)

```bash
npx sv add paraglide
```

The CLI will do all the scaffolding for you. Or you can set it up manually in the following section.

### Manually

#### Install `paraglide-js`

```bash
npx @inlang/paraglide-js@latest init
```

#### Add the vite plugin.

> [!NOTE]
> You can define strategy however you need.

```diff
// vite.config.ts
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
+import { paraglideVitePlugin } from '@inlang/paraglide-js';

export default defineConfig({
	plugins: [
		sveltekit(),
+		paraglideVitePlugin({
+			project: './project.inlang',
+			outdir: './src/lib/paraglide',
+			strategy: ['url'],
+		})
	]
});
```

#### Add lang attribute

See https://svelte.dev/docs/kit/accessibility#The-lang-attribute for more information.

```typescript
// src/hooks.server.ts
import type { Handle } from '@sveltejs/kit';
import { paraglideMiddleware } from '$lib/paraglide/server';
import { getTextDirection } from '$lib/paraglide/runtime';

// creating a handle to use the paraglide middleware
const paraglideHandle: Handle = ({ event, resolve }) =>
	paraglideMiddleware(event.request, ({ request, locale }) => {
		event.request = request;
		return resolve(event, {
			transformPageChunk: ({ html }) => 
				html
					.replace('%paraglide.lang%', locale)
					.replace('%paraglide.dir%', getTextDirection(locale))
		});
	});

export const handle: Handle = paraglideHandle;
```

```diff
<!-- src/app.html -->
<!doctype html>
-<html lang="en">
+<html lang="%paraglide.lang%" dir="%paraglide.dir%">
  ...
</html>
```

#### Resolve i18n routes to their delocalized routes

```typescript
// src/hooks.ts
import type { Reroute } from '@sveltejs/kit';
import { deLocalizeUrl } from '$lib/paraglide/runtime';

export const reroute: Reroute = (request) => deLocalizeUrl(request.url).pathname;
```

> [!IMPORTANT]
> The `reroute()` function must be exported from the `src/hooks.ts` file, not `src/hooks.server.ts`.


#### Overwrite default behaviour with reactivity

```typescript
// src/lib/paraglide.svelte.ts
import type { Locale as _Locale } from '$lib/paraglide/runtime';
import { browser } from '$app/environment';
import { goto } from '$app/navigation';
import { page } from '$app/state';

import {
  baseLocale,
  localizeUrl,
  overwriteGetLocale,
  overwriteSetLocale,
  toLocale
} from '$lib/paraglide/runtime';

export class Locale {
  #current: _Locale = $state(toLocale(browser && document.querySelector('html')?.lang) ?? baseLocale);

  constructor() {
    overwriteGetLocale(() => this.#current);

    overwriteSetLocale((locale) => {
      this.#current = locale;
      goto(localizeUrl(page.url.pathname, { locale }).href);
    });
  }
}
```

```typescript
// src/hooks.client.ts
import type { ClientInit } from '@sveltejs/kit';
import { Locale } from '$lib/paraglide.svelte';

export const init: ClientInit = () => {
  new Locale();
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

[Learn more about messages, parameters, and locale management →](/basics)

## Static site generation (SSG)

Enable [pre-rendering](https://svelte.dev/docs/kit/page-options#prerender) by adding the following line to `routes/+layout.ts`:

```typescript
// routes/+layout.ts
export const prerender = true;
```

SvelteKit crawls anchor tags during the build to generate all pages statically. We can ensure this happens by adding a locale switcher in `routes/+layout.svelte`. 

```svelte
<!-- routes/+layout.svelte -->
<script lang="ts">
  import type { Pathname } from '$app/types'
  import { resolve } from '$app/paths';
  import { page } from '$app/state';
  import { locales, localizeHref } from '$lib/paraglide/runtime';

  let { children } = $props();
</script>

<nav class="locale-switcher" aria-label="Languages">
  {#each locales as locale}
    <a href={resolve(localizeHref(page.url.pathname, { locale }) as Pathname )}>
      {locale}
    </a>
  {/each}
</nav>

{@render children()}
```

If you use the static adapter with `ssr = false` (SPA mode), make asset paths absolute to avoid locale-prefixed 404s (see [paraglide-js#503](https://github.com/opral/paraglide-js/issues/503)):

```diff
// vite.config.ts
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  // ...
  plugins: [
    sveltekit({
      // ...
+      paths: { relative:false },
    })
  }
});
```

## Troubleshooting

### URL and locale getting out of sync

If you use SSR with localized URLs, remember that the initial document request runs on the server. The server cannot read `localStorage`, so a strategy like:

```js
["localStorage", "preferredLanguage", "url", "baseLocale"]
```

can still redirect the first request based on `preferredLanguage` or `url` before hydration. If a stored override must affect the first request too, include a cookie strategy:

```js
["localStorage", "cookie", "preferredLanguage", "url", "baseLocale"]
```

Use `shouldRedirect()` in the root `+layout.svelte` only if you also want to re-sync the URL after client-side navigations. It does not replace the server-side middleware for the first page load. See the [client-side redirects guide](/i18n-routing#redirects).

### Disabling AsyncLocalStorage

If you're deploying to Vercel Edge or to Cloudflare Workers with Node.js compatibility enabled, keep AsyncLocalStorage enabled. Those runtimes support it today, so `disableAsyncLocalStorage` is no longer part of the recommended SvelteKit setup.

`disableAsyncLocalStorage` remains available as a compatibility fallback for runtimes that do not provide `AsyncLocalStorage` or `node:async_hooks` but still isolate each request.

> [!WARNING]
> Only use this fallback when your runtime guarantees per-request isolation. Using it in a multi-request server environment could leak locale state between concurrent requests.

See [AsyncLocalStorage in the Middleware Guide](/middleware#asynclocalstorage) if you need that escape hatch.

### No locale OR different locale when calling messages outside of .server.ts files

If you call messages on the server outside of load functions or hooks, you might run into issues with the locale not being set correctly. This can happen if you call messages outside of a request context.

```typescript
// hello.ts
import { m } from './paraglide/messages.js';

// 💥 there is no url in this context to retrieve
//    the locale from.
console.log(m.hello());
```
