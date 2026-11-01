---
"@inlang/paraglide-js": patch
---

Rewrite the `_unref(m).key` reads that compiled Vue templates use (production builds inline the template into `<script setup>`) to direct virtual message imports. Vue's `unref(x)` returns `x.value` only when `x.__v_isRef === true`; every export of the message namespace is a message function, so none can be `true`, `unref(m)` is `m`, and these reads are static. Before, a Vue component that used `m` in its template kept the whole message barrel, and the production build bundled every message.
