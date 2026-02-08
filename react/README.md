# @inlang/paraglide-js-react

React adapter for rendering Paraglide markup messages through one component.

```tsx
import { Message } from "@inlang/paraglide-js-react";
import { m } from "./paraglide/messages.js";

export function ContactCta() {
	return (
		<Message
			message={m.contact}
			inputs={{ email: "hello@example.com" }}
			markup={{
				link: ({ children, inputs }) => (
					<a href={`mailto:${inputs?.email}`}>{children}</a>
				),
				b: ({ children }) => <strong>{children}</strong>,
			}}
		/>
	);
}
```

`Message` uses `message.parts()` when present and falls back to `message()` for
plain-text messages.
