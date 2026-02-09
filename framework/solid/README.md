# @inlang/paraglide-js-solid

Solid adapter package for Paraglide JS.

```tsx
import { Message } from "@inlang/paraglide-js-solid";
import { m } from "./paraglide/messages.js";

const view = (
	<Message
		message={m.cta}
		inputs={{}}
		markup={{
			link: ({ children, options }) => <a href={options.to}>{children}</a>,
		}}
	/>
);
```

`Message` uses `message.parts()` when present and falls back to `message()` for
plain-text messages.
