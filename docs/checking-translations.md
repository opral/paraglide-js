---
title: Checking Translations
description: Find missing translations, missing variables and unused messages in a Paraglide JS project with inlang check, locally and in CI.
---

# Checking Translations

The [inlang CLI](https://inlang.com/m/2qj2w8pu/app-inlang-cli)'s `check` command finds problems in your translations before they ship:

- missing and empty translations and forms
- missing or unknown variables, and missing markup
- missing plural or select forms and selectors
- messages your source code no longer uses

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

All checks run by default. Pass one or more check flags, such as `--missing-translations` or `--unused-messages`, to run only those. See the [CLI documentation](https://inlang.com/m/2qj2w8pu/app-inlang-cli#check) for every check and option.

`check` needs `@inlang/cli` 3.4.0 or later. If your project has an older `@inlang/cli` in its `devDependencies`, `npx` runs that one: update it, or run `npx @inlang/cli@latest check`.

> [!NOTE]
> `inlang validate` and `inlang lint` are deprecated. `inlang lint` does nothing and exits with `0`, so replace it with `inlang check` in your scripts and CI.

## Unused messages

```sh
npx @inlang/cli check --project ./project.inlang --unused-messages
```

```
Checked project.inlang · 7 messages · locales en-US, pt-BR · 12 source files in ./

unused-message (2)
  legacy_banner
  password_label

2 findings
  unused-message  2
```

`check` searches the source files under the project's parent directory for message usages. Pass `--source` to search only some files or directories, e.g. `--source ./src`. Git-ignored files, `node_modules`, Paraglide's compiled output and build tool configs such as `vite.config.ts` are skipped. See [`--source`](https://inlang.com/m/2qj2w8pu/app-inlang-cli#check-options) for the details.

A message is only reported as unused when every usage in the searched source could be resolved. "Unused" means unused in that source: a message that another repository, or code outside `--source`, uses can still be reported.

### Requirement: m-function matcher 2.3.0 or later

The unused-messages check needs [`@inlang/plugin-m-function-matcher`](https://inlang.com/m/632iow21/plugin-inlang-mFunctionMatcher) 2.3.0 or later in the `modules` of your `project.inlang/settings.json`. Without it, `check` skips unused messages and asks you to add it. With an older version, it asks you to update the matcher:

```
unused-message not checked: The installed @inlang/plugin-m-function-matcher can't analyze usages.
  Unused-message check needs @inlang/plugin-m-function-matcher ≥ 2.3.0, update the module URL in settings.json: https://cdn.jsdelivr.net/npm/@inlang/plugin-m-function-matcher@2.2.6/dist/index.js
```

Update the version in the module URL (or, for a matcher loaded from `node_modules`, the installed package):

```diff
{
  "modules": [
    "https://cdn.jsdelivr.net/npm/@inlang/plugin-message-format@4.5.0/dist/index.js",
-   "https://cdn.jsdelivr.net/npm/@inlang/plugin-m-function-matcher@2.2.6/dist/index.js"
+   "https://cdn.jsdelivr.net/npm/@inlang/plugin-m-function-matcher@2.3.0/dist/index.js"
  ]
}
```

### Keep the analysis precise

The matcher analyzes JavaScript, TypeScript, JSX, TSX and Svelte files. These usages are fully resolved:

```ts
import { m } from "./paraglide/messages.js";

m.welcome_back(); // a call
m["nav.home"](); // a string literal key
const label = m.save_button; // a reference, called later
```

Building a message key at runtime makes the analysis incomplete, because the analyzer can't know which messages the key refers to:

```ts
m[`${fieldName}_label`](); // ❌ dynamic key
m[key](); // ❌ dynamic key
type Key = keyof typeof m; // ❌ can depend on every message
```

`check` then names the file, line and reason instead of listing unused messages:

```
unused-message incomplete: unused messages can't be determined because:
  src/Field.tsx:14:8  m[`${fieldName}_label`]  Dynamic message access cannot be resolved.
  Unused messages are only reported when every usage can be resolved, e.g. m.some_key().
```

To make it precise, reference each message directly instead of building its key. For example, map values to message functions:

```ts
const labels = {
	email: m.email_label,
	phone: m.phone_label,
};

labels[fieldName](); // ✅ every message is referenced directly
```

This also keeps the messages tree-shakable, as in [dynamic messages](./basics#dynamic-messages).

Some constructs make the analysis incomplete in any analyzed file, even when they don't touch messages, because they can load or pass on message modules unseen: re-exports from another module (`export * from "./x"`, `export { A } from "./A"`), dynamic `import()`, `import.meta.glob`, `require` and `eval`. Files the matcher can't analyze, such as `.vue`, `.astro`, `.svx`, `.mdx` or CommonJS files, make it incomplete too. The output names each location, so you can pass `--source` with the directories that use messages, or accept that unused messages aren't reported for that project.

## Run checks in CI

`check` exits with `1` when it reports findings or project errors, so it fails a CI job without extra configuration. Use `--locales` to fail only on the locales you ship. Findings that don't belong to a locale, such as unused messages, and project errors are always reported:

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

- `--no-fail` exits with `0` even if there are findings, e.g. for a report.
- `--format json` prints the full report for other tools: every finding, the status of each check and the location of each usage that couldn't be analyzed.
- A check that couldn't run or couldn't complete, such as unused messages with dynamic keys, is reported but doesn't fail the command.

See [exit codes](https://inlang.com/m/2qj2w8pu/app-inlang-cli#exit-codes) and [JSON output](https://inlang.com/m/2qj2w8pu/app-inlang-cli#json-output) in the CLI documentation.
