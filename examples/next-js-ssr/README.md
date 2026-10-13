---
title: Next.js i18n with SSR - Server-Side Internationalization
description: Use Paraglide JS with Next.js 16 App Router, client navigation, streaming, and Cache Components.
---

# Next.js SSR example

This example uses Next.js 16.4 and Paraglide JS 2.27 with Cache Components and Partial Prefetching enabled. Translations are compiled ahead of time; message functions remain synchronous. The locale is part of Next.js's route state, so locale changes through `<Link>` update server content, client content, and `<html lang>` together.

[Source code](https://github.com/opral/paraglide-js/tree/main/examples/next-js-ssr)

## Run the example

```bash
npm install
npm run dev
```

The public URLs are `/` for English and `/de` for German. The proxy maps them to the internal `[locale]` route without changing the browser URL.

## Set up an existing application

### Install and compile Paraglide

```bash
npx @inlang/paraglide-js@latest init
```

Add the plugin to `next.config.mjs`:

```js
import { paraglideWebpackPlugin } from "@inlang/paraglide-js";

export default {
	cacheComponents: true,
	skipProxyUrlNormalize: true,
	partialPrefetching: true,
	webpack(config) {
		config.plugins.push(
			paraglideWebpackPlugin({
				project: "./project.inlang",
				outdir: "./src/paraglide",
				emitTsDeclarations: true,
				strategy: ["url", "cookie", "baseLocale"],
			})
		);
		return config;
	},
};
```

`skipProxyUrlNormalize` preserves the incoming URL, including its origin, for the proxy rewrite.

Use `next dev --webpack` and `next build --webpack` in your package scripts. Next.js 16 uses Turbopack by default; the Webpack plugin requires Webpack. `next start` does not need this flag.

### Put the root layout and pages under `[locale]`

```text
src/
  proxy.ts
  app/
    [locale]/
      layout.tsx
      page.tsx
      ClientSideLocaleSwitch.tsx
      subpage/
        page.tsx
```

Move your root layout into `[locale]` and remove the layout above it. The locale must reach the root layout so changing locale updates the document language as well as the page.

### Preserve the locale in Next.js's route state

Create `src/proxy.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { paraglideMiddleware } from "./paraglide/server";

export function proxy(request: NextRequest) {
	return paraglideMiddleware(request, ({ request, locale }) => {
		const url = new URL(request.url);
		url.pathname = `/${locale}${url.pathname === "/" ? "" : url.pathname}`;
		const headers = new Headers(request.headers);
		headers.set("x-paraglide-locale", locale);
		return NextResponse.rewrite(url, { request: { headers } });
	});
}

export const config = {
	matcher: ["/((?!api|_next|.*\\..*).*)"],
};
```

Paraglide supplies a delocalized URL to the callback. Adding the locale back for the internal rewrite makes Next.js distinguish English and German routes. Rewriting both languages to the same route can leave cached layouts and page content in the previous language during client navigation.

The matcher excludes API routes, Next.js assets, and paths containing a dot. Adjust it if your application has page URLs containing dots.

### Resolve locale from async route parameters

In `src/app/[locale]/layout.tsx`:

```tsx
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { isLocale, getTextDirection, locales } from "@/paraglide/runtime";
import ClientSideLocaleSwitch from "./ClientSideLocaleSwitch";

export function generateStaticParams() {
	return locales.map((locale) => ({ locale }));
}

export default async function RootLayout({
	children,
	params,
}: {
	children: React.ReactNode;
	params: Promise<{ locale: string }>;
}) {
	const { locale } = await params;
	if (!isLocale(locale)) notFound();
	return (
		<html lang={locale} dir={getTextDirection(locale)}>
			<body>
				<ClientSideLocaleSwitch locale={locale} />
				<Suspense fallback={<p>Loading page...</p>}>{children}</Suspense>
			</body>
		</html>
	);
}
```

`generateStaticParams()` supplies the known root locales for Cache Components. It allows Next.js to prerender translated shells; request-time content can still stream inside Suspense.

Resolve `params` independently in each page and pass the locale to message functions and localized links:

```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { m } from "@/paraglide/messages";
import { isLocale, localizeHref } from "@/paraglide/runtime";

export default async function Page({
	params,
}: {
	params: Promise<{ locale: string }>;
}) {
	const { locale } = await params;
	if (!isLocale(locale)) notFound();
	return (
		<>
			<p>{m.example_message({ username: "Samuel" }, { locale })}</p>
			<Link href={localizeHref("/subpage", { locale })}>Subpage</Link>
		</>
	);
}
```

Do not initialize page translations by mutating a locale cache in the layout. Next.js can render pages independently of layouts, and client components have a separate server-rendering context.

### Pass locale into client components

```tsx
"use client";

import Link from "next/link";
import { m } from "@/paraglide/messages";
import { localizeHref, setLocale, type Locale } from "@/paraglide/runtime";

export default function ClientSideLocaleSwitch({ locale }: { locale: Locale }) {
	return (
		<>
			<p>{m.example_message({ username: "Client" }, { locale })}</p>
			<Link href={localizeHref("/", { locale: "de" })}>German</Link>
			<button onClick={() => setLocale("de")}>Switch to German</button>
		</>
	);
}
```

Passing the same locale during server rendering and hydration avoids mismatched translations. `<Link>` performs client navigation; `setLocale()` performs a full navigation by default.

### Read request data inside Suspense

With Cache Components, put `headers()` and `cookies()` access inside a Suspense boundary. Resolve the document language from the route parameters rather than request headers in the root layout.

```tsx
import { Suspense } from "react";
import { headers } from "next/headers";

async function RequestDetails() {
	const locale = (await headers()).get("x-paraglide-locale");
	return <p>Request locale: {locale}</p>;
}

// Inside a page:
<Suspense fallback={<p>Loading request...</p>}>
	<RequestDetails />
</Suspense>;
```

For a function using `"use cache"`, pass `locale` as an argument so it is included in the cache key. Read request headers outside the cached function. See the example's home page for both patterns.

## Production regression tests

```bash
npm install
npx playwright install chromium
npm run test:e2e
```

The tests build and start the production app with Cache Components enabled. They check direct SSR, hydration, client locale navigation without document replacement, browser back, localized subpages, programmatic switching, request headers, concurrent cache isolation, and unmatched routes.

[Learn more about messages, parameters, and locale management →](/basics)
