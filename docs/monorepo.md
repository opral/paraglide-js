---
title: Monorepo Setup
description: How to set up Paraglide in a monorepo - shared translations with isolated compiler options.
---

# Monorepo Setup

Two patterns for using Paraglide in a monorepo:

|                             | Pattern 1 | Pattern 2 |
| --------------------------- | :-------: | :-------: |
| Shared translations         |     ✓     |     ✓     |
| Per-package strategy/config |     ✓     |     ✗     |
| Single compile step         |     ✗     |     ✓     |

**Use Pattern 1** unless you specifically need a single compilation step.

## Pattern 1: Each Package Compiles (Recommended)

Create one `project.inlang` with your messages, then compile in each consuming package.

```diff
monorepo/
+ project.inlang/           # Shared inlang project
+ messages/
+   en.json
+   de.json
  packages/
    web/
      src/paraglide/        # Generated here
      vite.config.ts
    mobile/
      src/paraglide/        # Generated here
      vite.config.ts
```

Each package compiles from the shared project (see [Compiling Messages](./compiling-messages) for all options):

```bash
# From packages/web
npx @inlang/paraglide-js compile --project ../../project.inlang --outdir ./src/paraglide

# From packages/mobile (different strategy)
npx @inlang/paraglide-js compile --project ../../project.inlang --outdir ./src/paraglide --strategy cookie,baseLocale
```

### Shared UI packages

If multiple apps depend on a shared UI package, keep the locale strategy in the apps.

The simplest option is to make shared UI components accept already translated strings:

```tsx
// packages/ui/src/save-button.tsx
export function SaveButton(props: { label: string }) {
	return <button>{props.label}</button>;
}
```

```tsx
// packages/web/src/page.tsx
import * as m from "./paraglide/messages.js";
import { SaveButton } from "@myorg/ui/save-button";

<SaveButton label={m.save()} />;
```

This keeps the UI package independent from Paraglide. Each app translates with its own compiled runtime and strategy.

If the UI package owns reusable UI messages, compile the UI package with a fallback strategy such as `baseLocale`, then let each app initialize the UI package from the app's own runtime.

```bash
# From packages/ui
npx @inlang/paraglide-js compile --project ./project.inlang --outdir ./src/paraglide --strategy baseLocale
```

```ts
// packages/ui/src/i18n.ts
import {
	overwriteGetLocale,
	overwriteSetLocale,
	type Locale,
} from "./paraglide/runtime.js";

export function initUiI18n(options: {
	getLocale: () => Locale;
	setLocale: (
		locale: Locale,
		options?: { reload?: boolean }
	) => void | Promise<void>;
}) {
	overwriteGetLocale(options.getLocale);
	overwriteSetLocale(options.setLocale);
}
```

```ts
// packages/web/src/main.ts
import { getLocale, setLocale } from "./paraglide/runtime.js";
import { initUiI18n } from "@myorg/ui/i18n";

initUiI18n({ getLocale, setLocale });
```

```tsx
// packages/ui/src/save-button.tsx
import * as m from "./paraglide/messages.js";

export function SaveButton() {
	return <button>{m.save()}</button>;
}
```

Call `initUiI18n()` once in each app entrypoint before rendering UI components. The UI package should not detect the locale from URLs, cookies, headers, or storage. It should ask the app runtime for the current locale and let the app runtime handle locale changes.

> [!NOTE]
> In SSR apps, request safety still comes from the app runtime. Inject the app's request-scoped `getLocale` function instead of storing a concrete locale globally in the UI package.

> [!NOTE]
> The UI package must support every locale it can receive from consuming apps, or intentionally map unsupported locales before calling UI messages.

## Pattern 2: Shared i18n Package

Create a dedicated i18n package that compiles once. Other packages import from it.

> [!WARNING]
> All consuming packages must use the same locale detection strategy since compilation happens once. If your web app needs URL-based routing while your mobile app needs cookie-based detection, use Pattern 1 instead. Do not switch to Pattern 2 just to share UI translations; use [Shared UI packages](#shared-ui-packages) instead.

```
monorepo/
  packages/
    i18n/                   # Shared i18n package
      project.inlang/
      messages/
      src/paraglide/        # Generated once here
      package.json
    web/                    # Imports from @myorg/i18n
    mobile/                 # Imports from @myorg/i18n
```

```json
// packages/i18n/package.json
{
	"name": "@myorg/i18n",
	"devDependencies": {
		"@inlang/paraglide-js": "latest"
	},
	"scripts": {
		"build": "paraglide-js compile --project ./project.inlang --outdir ./src/paraglide --emit-ts-declarations"
	},
	"exports": {
		"./messages": "./src/paraglide/messages.js",
		"./runtime": "./src/paraglide/runtime.js"
	}
}
```

> [!NOTE]
> The `--emit-ts-declarations` flag generates `.d.ts` files so TypeScript consumers get proper type checking. This requires the `typescript` package to be installed.

```ts
// packages/web/src/app.ts
import * as m from "@myorg/i18n/messages";
import { getLocale } from "@myorg/i18n/runtime";
```

## See Also

- [Compiling Messages](./compiling-messages) - CLI, bundler plugins, and programmatic compilation
- [Strategy Configuration](./strategy) - Configure locale detection strategies
