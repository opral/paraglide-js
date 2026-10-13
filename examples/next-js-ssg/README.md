---
title: Next.js i18n with SSG - Static Site Internationalization
description: Generate localized static pages with Next.js 16 and Paraglide JS using async route parameters and explicit locale passing.
---

# Next.js SSG example

This example uses Next.js 16.4 and Paraglide JS 2.27 to generate English and German pages at build time. Both locales have a URL prefix: `/en` and `/de`. No proxy is needed.

[Source code](https://github.com/opral/paraglide-js/tree/main/examples/next-js-ssg)

## Run the example

```bash
npm install
npm run dev
```

Visit `/en` or `/de`. For a production build, run `npm run build` followed by `npm run start`.

## Set up an existing application

### Install and compile Paraglide

```bash
npx @inlang/paraglide-js@latest init
```

Add the plugin to `next.config.mjs` with URL patterns that prefix **every** locale, including the base locale:

```js
import { paraglideWebpackPlugin } from "@inlang/paraglide-js";

export default {
	webpack(config) {
		config.plugins.push(
			paraglideWebpackPlugin({
				project: "./project.inlang",
				outdir: "./src/paraglide",
				emitTsDeclarations: true,
				strategy: ["url", "cookie", "baseLocale"],
				urlPatterns: [
					{
						pattern: "/:path(.*)?",
						localized: [
							["en", "/en/:path(.*)?"],
							["de", "/de/:path(.*)?"],
						],
					},
				],
			})
		);
		return config;
	},
};
```

Use `next dev --webpack` and `next build --webpack` in your package scripts so the plugin runs. Next.js 16 defaults to Turbopack. `next start` does not need this flag.

### Put the root layout and pages under `[locale]`

```text
src/app/
  [locale]/
    layout.tsx
    page.tsx
    ClientSideLocaleSwitch.tsx
```

Move the root layout into `[locale]` and remove any layout above it. Generate the locale parameters and await them in the root layout:

```tsx
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
				{children}
			</body>
		</html>
	);
}
```

Next.js 16 requires async `params`. Resolve the locale in each page independently; do not rely on a locale cache mutated by the layout:

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
			<Link href={localizeHref("/", { locale: "en" })}>English</Link>
			<Link href={localizeHref("/", { locale: "de" })}>German</Link>
		</>
	);
}
```

### Pass locale into client components

Pass the route locale through props and use it for translations during both server rendering and hydration:

```tsx
"use client";

import { m } from "@/paraglide/messages";
import { setLocale, type Locale } from "@/paraglide/runtime";

export default function ClientSideLocaleSwitch({ locale }: { locale: Locale }) {
	return (
		<>
			<p>{m.example_message({ username: "Client" }, { locale })}</p>
			<button onClick={() => setLocale("de")}>Switch to German</button>
		</>
	);
}
```

Use `<Link>` with `localizeHref()` for client navigation. `setLocale()` performs a full navigation by default.

For request-time content, Cache Components, or an unprefixed base-locale URL, use the SSR example above. Keep request-time APIs such as `headers()` and `cookies()` out of pages intended to remain fully static.

[Learn more about messages, parameters, and locale management →](/basics)
