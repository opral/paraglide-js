---
"@inlang/paraglide-js": patch
---

Stop the bundler plugins from rewriting unchanged output when a watch event arrives before `buildStart` or after a failed compile. Such a recompile now starts from the hashes of the output on disk, as `buildStart` does, so it writes only the files that differ. Previously it rewrote every generated file, and in Vite each rewritten message module became another watch event: with `message-modules` and a few thousand messages, a dev server could stay busy for minutes after startup.
