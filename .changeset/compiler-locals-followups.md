---
"@inlang/paraglide-js": minor
---

Fix local variable compilation and support ICU plural offsets.

- A message function now declares only the local variables it reads, through match conditions, its patterns, or other locals it reads. Unread locals and an unread inputs parameter no longer fail TypeScript's `noUnusedLocals` and `noUnusedParameters` in checked projects.
- Local variables are emitted in dependency order, so a local that reads a local declared after it no longer throws a `ReferenceError` at runtime. Locals that reference each other in a cycle now fail compilation with an error that names the message, the locale and the cycle.
- A message that reads an undeclared variable, for example through `.local e = {$count}` without `.input {$count}`, now fails compilation with an error that names the message, the locale and the variable. It used to compile to code that threw `ReferenceError: i is not defined` or read an input missing from the message's type. Undeclared variables in patterns already failed compilation.
- `plural` supports the `offset` option that ICU MessageFormat 1 `{count, plural, offset:1 …}` imports as: the category is selected for `count - offset`, while exact matches like `=1` compare `count` itself.

**Behavior change:** a project with a local that reads an undeclared variable, such as `local countPlural = count: plural` without `input count`, used to compile, and worked at runtime as long as the message had another input. It now fails compilation. Add the missing `input` declaration, or update the inlang message format plugin, which declares the inputs that locals read since 4.4.1.
