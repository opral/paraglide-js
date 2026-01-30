# ICU1 plugin example

This example shows how to configure the ICU MessageFormat v1 storage plugin in `project.inlang/settings.json` and use ICU1 messages in `messages/{locale}.json`.

## Files

- `project.inlang/settings.json` uses the ICU1 plugin and `plugin.inlang.icu-messageformat-1` config.
- `messages/en.json` and `messages/de.json` contain ICU1 `select` and `plural` messages.

## Try it

From the repo root:

```sh
npx @inlang/paraglide-js@latest compile --project ./examples/icu1/project.inlang --outdir ./examples/icu1/src/paraglide
```

(Adjust the `--outdir` if you want the generated files elsewhere.)
