---
"@inlang/paraglide-js": patch
---

Compute the formatter cache key of literal options when compiling messages. Calls to `plural`, `number`, `datetime`, `relativetime` and ICU `#` whose options are all literals now pass the key the registry would otherwise compute on every call by sorting, checking and serializing the options. Results are unchanged: the registry uses the same cache and keeps its `Object.prototype` check. Options that read variables keep the runtime key.
