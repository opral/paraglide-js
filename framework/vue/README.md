# @inlang/paraglide-js-vue

Vue adapter package for Paraglide JS.

```ts
import { Message } from "@inlang/paraglide-js-vue";
import { h } from "vue";
import { m } from "./paraglide/messages.js";

h(Message, {
	message: m.cta,
	inputs: {},
	markup: {
		link: ({ children, options }) => h("a", { href: options.to }, children),
	},
});
```

`Message` uses `message.parts()` when present and falls back to `message()` for
plain-text messages.
