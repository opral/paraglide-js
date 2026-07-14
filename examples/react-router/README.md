---
title: React Router i18n - Internationalization for React Router v7
description: Add multi-language support to React Router v7 apps with Paraglide JS. Type-safe translations, localized routing, SSR support, and up to 70% smaller i18n bundle sizes.
---

# React Router v7 (framework) example

Paraglide JS is the best i18n library for React Router v7 in framework mode (using Vite), with first-class i18n routing via URL-based localization built in.

It's a compiler-based i18n library that emits tree-shakable translations, leading to up to 70% smaller i18n bundle sizes compared to runtime based libraries.

- Fully type-safe with IDE autocomplete
- SEO-friendly localized URLs with the [i18n routing strategy](https://paraglidejs.com/strategy#url)
- Works with CSR and SSR

[Source code](https://github.com/opral/monorepo/tree/main/inlang/packages/paraglide/paraglide-js/examples/react-router)

## Getting started

1. Init Paraglide JS

```bash
npx @inlang/paraglide-js@latest init 
```

2. Add the vite plugin to your `vite.config.ts`:

```diff
import { reactRouter } from "@react-router/dev/vite";
import { defineConfig } from "vite";
+import { paraglideVitePlugin } from "@inlang/paraglide-js";

export default defineConfig({
	plugins: [
		reactRouter(),
+		paraglideVitePlugin({
+			project: "./project.inlang",
+			outdir: "./app/paraglide",
+			emitTsDeclarations: true,
+		}),
	],
});
```

3. Done :)

## Usage

```js
import { m } from "./paraglide/messages.js";
import { getLocale, setLocale } from "./paraglide/runtime.js";

// Use messages
m.greeting({ name: "World" }); // "Hello World!"

// Get and set locale
getLocale();    // "en"
setLocale("de"); // switches to German
```

[Learn more about messages, parameters, and locale management →](/basics)

## Server side rendering using middleware

Enable the middleware flag in `react-router.config.ts`:

```ts
export default {
	ssr: true,
	future: {
		v8_middleware: true,
	},
} satisfies Config;
```

Define the middleware inline in `root.tsx`:
```ts
import { type MiddlewareFunction } from "react-router";
import { paraglideMiddleware } from "./paraglide/server.js";

export const middleware: MiddlewareFunction[] = [
	(ctx, next) => paraglideMiddleware(ctx.request, () => next()),
];
```

In `routes.ts`:

```diff
import {
	type RouteConfig,
	index,
	prefix,
	route,
} from "@react-router/dev/routes";

export default [
	// prefixing each path with an optional :locale
	// optional to match a path with no locale `/page`
	// or with a locale `/en/page`
	//
	// * make sure that the pattern you define here matches
	// * with the urlPatterns of paraglide JS if you use
	// * the `url` strategy
	//
	// React Router middleware doesn't allow passing a rewritten
	// Request to loaders yet, so keep the locale prefix here.
+	...prefix(":locale?", [
		index("routes/home.tsx"),
		route("about", "routes/about.tsx"),
+	]),
] satisfies RouteConfig;
```

Now you can use `getLocale` function anywhere in your project.

### Translated pathnames

React Router matches the incoming URL against the routes you define in
`routes.ts`. The middleware can set the locale and request context, but React
Router's middleware API does not let Paraglide pass a rewritten request to
`next()` before route matching.

If you use translated pathnames, define localized route aliases in `routes.ts`
and point them at the same route module. Give each alias a unique route `id`
when multiple entries use the same file.

```ts
import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
	index("routes/home.tsx"),
	route("en/pricing", "routes/pricing.tsx", { id: "pricing-en" }),
	route("de/preise", "routes/pricing.tsx", { id: "pricing-de" }),
	route("pl/cennik", "routes/pricing.tsx", { id: "pricing-pl" }),
] satisfies RouteConfig;
```

Keep the corresponding Paraglide `urlPatterns` so helpers like
`localizeHref("/pricing")` generate the public URL that React Router can match:

```ts
paraglideVitePlugin({
	project: "./project.inlang",
	outdir: "./app/paraglide",
	emitTsDeclarations: true,
	strategy: ["url", "baseLocale"],
	urlPatterns: [
		{
			pattern: "/pricing",
			localized: [
				["en", "/en/pricing"],
				["de", "/de/preise"],
				["pl", "/pl/cennik"],
			],
		},
	],
});
```

## Server side rendering without middleware (legacy)

If you can't use middleware yet, you can still wire SSR manually:

In `root.tsx`:

```diff
import {
	assertIsLocale,
	baseLocale,
	getLocale,
	isLocale,
	overwriteGetLocale,
} from "./paraglide/runtime";

+export function loader(args: Route.LoaderArgs) {
+	return {
		// detect the locale from the path. if no locale is found, the baseLocale is used.
		// e.g. /de will set the locale to "de"
+		locale: isLocale(args.params.locale) ? args.params.locale : baseLocale,
+	};
}

// server-side rendering needs to be scoped to each request
// react context is used to scope the locale to each request
// and getLocale() is overwritten to read from the react context
+const LocaleContextSSR = createContext(baseLocale);
+if (import.meta.env.SSR) {
+	overwriteGetLocale(() => assertIsLocale(useContext(LocaleContextSSR)));
+}

export default function App(props: Route.ComponentProps) {
	return (
		// use the locale
+		<LocaleContextSSR.Provider value={props.loaderData.locale}>
			<Outlet />
+		</LocaleContextSSR.Provider>
	);
}
```

Derive the loader's return type once so you can share it with the meta
function:

```ts
type RootLoaderData = Awaited<ReturnType<typeof loader>>;
```

### Meta generation

React Router generates the `<meta>` tags in a separate context on the client. To
make sure the `getLocale` helper returns the correct locale during the
generation step, update your `meta` function like this:

```ts
export function meta({ data }: Route.MetaArgs) {
  if (!import.meta.env.SSR) {
    const locale = assertIsLocale(
      (data as RootLoaderData | undefined)?.locale ?? baseLocale,
    );

    overwriteGetLocale(() => locale);
  } else {
    overwriteGetLocale(() =>
      assertIsLocale(useContext<Locale>(LocaleContextSSR))
    );
  }

  return [];
}
```

This mirrors the server setup shown above while ensuring that the meta
generation step runs with the correct locale, even when multiple requests are
handled in parallel. Access the locale returned by your root loader through the
`data` (aka `loaderData`) argument instead of `matches`.

In `routes.ts`: 

```diff
import {
	type RouteConfig,
	index,
	prefix,
	route,
} from "@react-router/dev/routes";

export default [
	// prefixing each path with an optional :locale
	// optional to match a path with no locale `/page`
	// or with a locale `/en/page`
	//
	// * make sure that the pattern you define here matches
	// * with the urlPatterns of paraglide JS if you use
	// * the `url` strategy
+	...prefix(":locale?", [
		index("routes/home.tsx"),
		route("about", "routes/about.tsx"),
+	]),
] satisfies RouteConfig;
```
