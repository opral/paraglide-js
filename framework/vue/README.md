# @inlang/paraglide-js-vue

Vue adapter package for Paraglide JS.

```ts
import { ParaglideMessage } from "@inlang/paraglide-js-vue";
import { h } from "vue";
import { m } from "./paraglide/messages.js";

h(ParaglideMessage, {
	message: m.cta,
	inputs: {},
	markup: {
		link: ({ children, options }) => h("a", { href: options.to }, children),
	},
});
```

`ParaglideMessage` uses `message.parts()` when present and falls back to `message()` for
plain-text messages.
