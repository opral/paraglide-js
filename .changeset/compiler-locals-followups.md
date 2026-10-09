---
"@inlang/paraglide-js": minor
---

**Upgrade note:** compilation now fails with `… references the variable "count" in the local variable "countPlural", but "count" is not declared` when a local variable that the message uses reads a variable that has no `input` declaration, such as `local countPlural = count: plural` without `input count`. The inlang message format plugin before 4.4.1 imports such a local without adding the `input`. These messages used to compile, and worked at runtime as long as the message had another input. Fix: add the missing `input count` declaration, or update the inlang message format plugin to 4.4.1 or later, which adds it.

Fix local variable compilation and support ICU plural offsets.

- A message function now declares only the local variables it reads, through match conditions, its patterns, or other locals it reads. Unread locals and an unread inputs parameter no longer fail TypeScript's `noUnusedLocals` and `noUnusedParameters` in checked projects.
- Local variables are emitted in dependency order, so a local that reads a local declared after it no longer throws a `ReferenceError` at runtime. Locals that reference each other in a cycle now fail compilation with an error that names the message, the locale and the cycle.
- A message that reads an undeclared variable, for example through `.local e = {$count}` without `.input {$count}`, now fails compilation with an error that names the message, the locale and the variable. It used to compile to code that threw `ReferenceError: i is not defined` or read an input missing from the message's type. Undeclared variables in patterns already failed compilation.
- `plural` supports the `offset` option that ICU MessageFormat 1 `{count, plural, offset:1 …}` imports as: the category is selected for `count - offset`, while exact matches like `=1` compare `count` itself.
