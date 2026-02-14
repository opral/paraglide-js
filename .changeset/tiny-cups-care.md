---
"@inlang/paraglide-js": minor
---

Add route-level locale strategy overrides via `routeStrategies`.

You can now define per-route strategy behavior (first match wins), including:

- `strategy` overrides for paths like `/dashboard/*` and `/rpc/*`
- `exclude: true` to skip i18n middleware behavior for paths like `/api/*`
