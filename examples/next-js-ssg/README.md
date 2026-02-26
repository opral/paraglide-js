---
title: Next.js i18n with SSG - Static Site Internationalization
description: Build statically generated multi-language Next.js sites with Paraglide JS. Type-safe translations, SEO-friendly localized pages, and up to 70% smaller i18n bundle sizes.
---

# Next JS SSG example

Paraglide JS brings type-safe, tree-shakable translations to statically generated Next.js sites.

It's a compiler-based i18n library that emits tree-shakable translations, leading to up to 70% smaller i18n bundle sizes compared to runtime based libraries.

- Fully type-safe with IDE autocomplete
- SEO-friendly localized URLs with the [i18n routing strategy](https://inlang.com/m/gerre34r/library-inlang-paraglideJs/strategy#url)
- Works with CSR, SSR, and SSG

[Source code](https://github.com/opral/monorepo/tree/main/inlang/packages/paraglide/paraglide-js/examples/next-js-ssg)

> [!TIP]
> If you start from scratch, we recommend using a Vite-based framework. [Read why](https://github.com/opral/inlang-paraglide-js/issues/245#issuecomment-2608727658).

> [!WARNING]
> This SSG example requires the locale prefixed in the path like `/en/page`.

## Getting started

### Install paraglide js

```bash
npx @inlang/paraglide-js@latest init
```

### Add the webpack plugin to the `next.config.js` file:

> [!NOTE]
> The URL Pattern ensures that `localizeHref()` includes the locale in the path.

```diff
import { paraglideWebpackPlugin } from "@inlang/paraglide-js";

/**
 * @type {import('next').NextConfig}
 */
export default {
+	webpack: (config) => {
+		config.plugins.push(
+			paraglideWebpackPlugin({
+				outdir: "./src/paraglide",
+				project: "./project.inlang",
+       strategy: ["url", "cookie", "baseLocale"],
+				urlPatterns: [
+					{
+						pattern: 'https://:domain(.*)/:path*',
+						localized: [
+							['de', 'https://:domain(.*)/de/:path*'],
+							['en', 'https://:domain(.*)/:path*'],
+						],
+					},
+				],
+			})
+		);
+		return config;
	},
};
```

### Create a `[locale]` folder and move all of your pages in there

```
app/
  - [locale]/
    - index.tsx
    - about.tsx
    - ...
```

### Add the locale handling to your root layout

```diff
app/
  - [locale]/
    - index.tsx
+   - layout.tsx
    - about.tsx
    - ...
```

```diff
+import { cache } from "react";
+import {
+	assertIsLocale,
+	baseLocale,
+	getLocale,
+	getTextDirection,
+	overwriteGetLocale,
+} from "../paraglide/runtime.js";

// needed for SSG
+export function generateStaticParams() {
+	return [{ locale: "en" }, { locale: "de" }];
+}

// scopes the locale per request
+let ssrLocale = cache(() => ({
+	locale: baseLocale,
+}));

// overwrite the getLocale function to use the locale from the request
+overwriteGetLocale(() => assertIsLocale(ssrLocale().locale));

export default async function RootLayout({
	children,
	params,
}: {
	children: any;
	params: any;
}) {
	// can't use async params because the execution order get's screwed up.
	// this is something nextjs has to fix
+	ssrLocale().locale = params.locale;
		return (
			<html lang={getLocale()} dir={getTextDirection()}>
				<body>
					{children}
				</body>
			</html>
		);
}
```

## Usage

```js
import { m } from "../paraglide/messages.js";
import { getLocale, setLocale } from "../paraglide/runtime.js";

// Use messages
m.greeting({ name: "World" }); // "Hello World!"

// Get and set locale
getLocale();    // "en"
setLocale("de"); // switches to German
```

[Learn more about messages, parameters, and locale management →](/m/gerre34r/library-inlang-paraglideJs/basics)
