---
og:title: "Find Unused Translations and Fail CI on Missing Ones"
og:description: "Find unused translation keys, missing translations and missing variables in a SvelteKit, React or TypeScript app with one command. Use it locally and in GitHub Actions."
og:type: article
---

# Find Unused Translations and Fail CI on Missing Ones

Translations rot. A feature gets removed and its messages stay. A new message ships in English and nobody adds the German one. A rename drops a `{name}` variable in one locale. Nobody notices until a user does.

`inlang check` finds these problems in your Paraglide JS project. It runs locally and in CI, and it fails the build when it finds something.

```sh
npx @inlang/cli check --project ./project.inlang
```

```
Checked project.inlang · 7 messages · locales en-US, pt-BR · 2 source files in ./

missing-translation (1)
  welcome_back  pt-BR  no translation

missing-variable (2)
  cart_items  pt-BR  missing {count} (countPlural=other)
  greeting    pt-BR  missing {name}

3 findings
  missing-translation  1
  missing-variable     2
```

## What `inlang check` finds

| Problem | Example |
| --- | --- |
| Missing or empty translations | `welcome_back` has no `pt-BR` text |
| Missing or unknown variables | `{name}` is missing in one locale |
| Missing markup | A markup tag from the source text is gone in a translation |
| Missing plural or select forms | A locale lacks a plural form its language needs |
| Unused messages | `legacy_banner` is never used in your code |

All checks run by default. Pass `--missing-translations` or `--unused-messages` to run only one.

## Find unused translation keys

An unused message is a message that no file in your source code uses. Run only this check:

```sh
npx @inlang/cli check --project ./project.inlang --unused-messages
```

```
unused-message (2)
  legacy_banner
  password_label
```

This works because Paraglide messages are imported functions. The analyzer follows the import and sees which messages you call. It does not guess from strings:

```ts
import { m } from "./paraglide/messages.js";

m.welcome_back(); // a call
m["nav.home"](); // a string literal key
const label = m.save_button; // a reference, called later
```

You need `@inlang/plugin-m-function-matcher` 2.3.0 or later in the `modules` of your `project.inlang/settings.json`:

```json
{
  "modules": [
    "https://cdn.jsdelivr.net/npm/@inlang/plugin-message-format@4.5.0/dist/index.js",
    "https://cdn.jsdelivr.net/npm/@inlang/plugin-m-function-matcher@2.3.0/dist/index.js"
  ]
}
```

### Dynamic keys never delete real messages

A key built at runtime can point to any message:

```ts
m[`${fieldName}_label`](); // dynamic key
```

`check` does not guess. It reports the file, the line and the reason, and it lists no unused messages until you fix it:

```
unused-message incomplete: unused messages can't be determined because:
  src/Field.tsx:14:8  m[`${fieldName}_label`]  Dynamic message access cannot be resolved.
```

Reference each message directly instead. This also keeps your messages tree-shakable:

```ts
const labels = {
  email: m.email_label,
  phone: m.phone_label,
};

labels[fieldName]();
```

The analyzer reads JavaScript, TypeScript, JSX, TSX and Svelte files. `.vue`, `.astro`, `.mdx` and CommonJS files make the result incomplete. Use `--source ./src` to search only the folders that use messages.

## Fail CI on missing translations

`check` exits with code `1` when it reports findings. A CI job fails without extra setup:

```yaml
# .github/workflows/i18n.yml
name: i18n
on: pull_request
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: npx @inlang/cli check --project ./project.inlang --locales de,fr
```

- `--locales de,fr` fails only on the locales you ship.
- `--format json` prints the full report for other tools.
- `--no-fail` exits with `0`, for example for a report.

The missing-translation checks work the same in SvelteKit, React, TanStack Start, Next.js and Astro projects, because they read your inlang project and not your framework. The unused-messages check needs source files the analyzer can read, see above.

## Why this matters for coding agents

A coding agent that adds a feature adds English text. It often forgets the other locales, and it rarely removes messages it no longer needs. A CI check gives the agent a clear failure to fix, in the same way a type error does.

## Coming from `inlang lint`?

`inlang lint` and `inlang validate` are deprecated. `inlang lint` does nothing and exits with `0`, so a CI job that still runs it never fails. Replace it with `inlang check`. `check` needs `@inlang/cli` 3.4.0 or later. If your `devDependencies` pin an older CLI, `npx` runs that one. Update it, or run `npx @inlang/cli@latest check`.

## Next steps

- [Checking translations](/checking-translations): every check, flag and exit code
- [Message keys](/message-keys): which key patterns the analyzer resolves
- [Quick start](/basics): set up Paraglide JS in a new project
