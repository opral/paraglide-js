# @inlang/paraglide-js-react

React adapter for rendering Paraglide markup messages through one component.

```tsx
import { ParaglideMessage } from "@inlang/paraglide-js-react";
import { m } from "./paraglide/messages.js";

export function ContactCta() {
	return (
		<ParaglideMessage
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

`ParaglideMessage` uses `message.parts()` when present and falls back to `message()` for
plain-text messages.
