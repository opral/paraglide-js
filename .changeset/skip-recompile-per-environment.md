---
"@inlang/paraglide-js": minor
---

Skip recompilation when inputs are unchanged across bundler runs in the same process

`vite build` fires `buildStart` once per environment (client, ssr, ...) and each run did a full `compile()` — project loading and message compilation — even though the inputs hadn't changed. The plugin now hashes the tracked input files, their directory listings, and the output-affecting options after a successful compile, and skips `compile()` entirely when the digest matches on the next run. The second and later environments become near-free:

```
vite v6.4.1 building for production...
✔ [paraglide-js] Compilation complete (locale-modules)
✓ built in 634ms
vite v6.4.1 building SSR bundle for production...
ℹ [paraglide-js] Compilation skipped — inputs unchanged (locale-modules)
✓ built in 15ms
```

The digest fails open: any state it can't certify (missing files, read errors, changed options, a failed compile) forces a recompile. Multi-compiler webpack setups (client + server) benefit the same way via `beforeRun`.

Also fixed along the way:

- A user-provided `fs` option silently bypassed the plugin's file-read tracking (the args spread overrode the tracked fs wrapper), which left file watching inert for custom-fs setups.
- The watch-target filter ignored any path *containing* the substring "cache" — a project under e.g. `/cachet-app/` had its inputs excluded from file watching. It now matches whole path segments only.

Fixes https://github.com/opral/paraglide-js/issues/693
