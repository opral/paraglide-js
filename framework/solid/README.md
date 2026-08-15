Solid component for rendering [Paraglide JS](https://github.com/opral/paraglide-js) messages that contain markup.

```tsx
import { ParaglideMessage } from "@inlang/paraglide-js-solid";
import { m } from "./paraglide/messages.js";

const view = (
	<ParaglideMessage
		message={m.cta}
		inputs={{}}
		markup={{
			link: ({ children, options }) => <a href={options.to}>{children}</a>,
		}}
	/>
);
```

`ParaglideMessage` uses `message.parts()` when present and falls back to `message()` for
plain-text messages.
