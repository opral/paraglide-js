---
"@inlang/paraglide-js": minor
---

Add type-safe literal unions for match variants in generated message typings https://github.com/opral/paraglide-js/issues/538.

For example, the following minimal message definition:

```json
{
	"auth_password_error": [
		{
			"match": {
				"type=empty": "You must provide a password"
			}
		}
	]
}
```

Before:

```ts
m.auth_password_error({ type: "typo" }); // ✅ OK (typed as NonNullable<unknown>)
```

After:

```ts
m.auth_password_error({ type: "typo" }); // 💥 Type error
```
