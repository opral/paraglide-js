---
title: Next.js i18n with SSR - Server-Side Internationalization
description: Implement server-rendered multi-language support in Next.js with Paraglide JS. Type-safe translations, automatic locale detection, and up to 70% smaller i18n bundle sizes.
---

# Next JS SSR example

Paraglide JS brings type-safe, tree-shakable translations to Next.js with SSR.

It's a compiler-based i18n library that emits tree-shakable translations, leading to up to 70% smaller i18n bundle sizes compared to runtime based libraries.

- Fully type-safe with IDE autocomplete
- SEO-friendly localized URLs with the [i18n routing strategy](https://inlang.com/m/gerre34r/library-inlang-paraglideJs/strategy#url)
- Works with CSR and SSR

[Source code](https://github.com/opral/monorepo/tree/main/inlang/packages/paraglide/paraglide-js/examples/next-js-ssr)

> [!TIP]
> If you start from scratch, we recommend using a Vite-based framework. [Read why](https://github.com/opral/inlang-paraglide-js/issues/245#issuecomment-2608727658).

> [!WARNING]
> The setup has been reported as fragile for advanced use-cases [#407](https://github.com/opral/inlang-paraglide-js/issues/407). Use [next-intl](https://next-intl.dev/) if you need a more stable setup.

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
+			})
+		);
+		return config;
	},
};
```

### Add the `paraglideMiddleware()` to `src/middleware.ts`

```diff
app/
  - index.tsx
+ - middleware.ts
  - about.tsx
  - ...
```

```ts
import { NextRequest, NextResponse } from "next/server";
import { paraglideMiddleware } from "./paraglide/server";

export function middleware(request: NextRequest) {
	return paraglideMiddleware(request, ({ request, locale }) => {
		request.headers.set("x-paraglide-locale", locale);
		request.headers.set("x-paraglide-request-url", request.url);
		return NextResponse.rewrite(request.url, request);
	});
}
```

### Add locale handling in the root layout

NextJS does not support AsyncLocalStorage. Hence, we need to use a workaround to render the correct locale. Please upvote this issue https://github.com/vercel/next.js/issues/69298.

> [!NOTE]
> The warning for "headers must be async" has no effect on production. NextJS needs to fix their API or introduce AsyncLocalStorage. More context here https://github.com/opral/inlang-paraglide-js/issues/245#issuecomment-2608727658

```diff
+import {
+	assertIsLocale,
+	baseLocale,
+	getLocale,
+	getTextDirection,
+	Locale,
+	overwriteGetLocale,
+	overwriteGetUrlOrigin,
+} from "../paraglide/runtime";
import React, { cache } from "react";
import { headers } from "next/headers";

+const ssrLocale = cache(() => ({ locale: baseLocale, origin: "http://localhost" }));

// overwrite the getLocale function to use the locale from the request
+overwriteGetLocale(() => assertIsLocale(ssrLocale().locale));
+overwriteGetUrlOrigin(() => ssrLocale().origin);

export default async function RootLayout({
	children,
}) {
	// @ts-expect-error - headers must be sync
	// https://github.com/opral/inlang-paraglide-js/issues/245#issuecomment-2608727658
+	ssrLocale().locale = headers().get("x-paraglide-locale") as Locale;
  // @ts-expect-error - headers must be sync
	ssrLocale().origin = new URL(headers().get("x-paraglide-request-url")).origin; 

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
