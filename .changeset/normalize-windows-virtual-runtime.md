---
"@inlang/paraglide-js": patch
---

Normalize filesystem module IDs returned by virtual messages on Windows and resolve physical imports through Vite so its symlink settings are respected. This prevents duplicate runtime instances that caused SSR and prerendered messages to use the base locale instead of the request locale.

Preserve Windows UNC network-share prefixes when normalizing configuration and watch paths. Handle trailing separators in directory containment checks so config edits reload correctly at UNC share roots, drive roots, and POSIX roots.
