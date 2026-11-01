---
"@inlang/paraglide-js": patch
---

Give every message and local variable its own identifier in the generated code. Keys that map to the same module id, like `a.b` and `a_b`, no longer overwrite each other: the key that is that id keeps it, and the others get an escaped id such as `$a$2e$b`. Messages named `_index`, `eval` or `arguments`, a formatted message named `registry`, and local variables named `i`, `String`, `class` or `a-b` no longer break the output. In grouped output, ids are unique within a shard, and the declaration barrel exports a type name two shards share under each key's escaped name. The registry is imported as `__paraglideRegistry`. Keys that don't collide keep their file, export and type names.
