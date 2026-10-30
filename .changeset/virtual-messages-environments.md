---
"@inlang/paraglide-js": patch
---

Update every Vite environment when virtual messages change. A custom environment, such as a framework's runnable server environment, kept serving the previous translations after a catalog edit, because only the client and SSR module graphs were invalidated. Each environment's module graph is now invalidated and its hot channel notified, once. Vite 5, which has no environment API, keeps the previous behavior.
