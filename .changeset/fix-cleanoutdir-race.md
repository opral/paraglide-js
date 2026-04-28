---
"@inlang/paraglide-js": patch
---

Fix race condition where `paraglideVitePlugin` (and the rollup/rolldown/rspack/esbuild plugins) wiped the output directory on every fresh process, racing concurrent reads from SSR/prerender modules and sibling Vite instances. The plugin now seeds `previousCompilation` from existing on-disk hashes on the first compile, so warm restarts are a no-op (zero writes when inputs haven't changed) and the recursive wipe is gone. The webpack plugin's wipe behavior is unchanged but now also deletes orphaned files on its first compile. Closes #659.
