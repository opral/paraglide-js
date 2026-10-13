---
"@inlang/paraglide-js": minor
---

Add async `getMessage(key, inputs?, options?)` in generated `dynamic.js`. The new default `message-groups` layout replaces individual message files with sorted groups containing their compiled functions and locale variants. Groups adapt to catalog size, with up to 64 keys and approximately 64 KiB of generated source (a larger single message stays intact). Literal imports support native ESM and bundler code splitting, without loader configuration or a per-key import registry.

Synchronous `m.*` calls use the same functions and remain tree-shakeable. Literal keys retain input types, locale is captured before loading, and loading failures expose `MessageLoadError` with key, locale and cause. Grouped output supports unsafe and reserved IDs without individual-filename collisions, including `then`.

The compiler and ordinary bundler plugins now default to `message-groups` in development and production. Generated internal filenames change to `messages/group-NNN.js`; the public message API is unchanged. Explicit `message-modules` and `locale-modules` layouts remain available, without `dynamic.js`.
