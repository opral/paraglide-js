# @inlang/paraglide-js-vue

Vue component for rendering Paraglide JS messages that contain markup.

Built on [Paraglide JS](https://github.com/opral/paraglide-js).

```vue
<script setup lang="ts">
import { ParaglideMessage } from "@inlang/paraglide-js-vue";
import { h } from "vue";
import { m } from "./paraglide/messages.js";

const markup = {
	link: ({ children, options }) => h("a", { href: options.to }, children),
};
</script>

<template>
	<ParaglideMessage :message="m.cta" :inputs="{}" :markup="markup" />
</template>
```

`ParaglideMessage` uses `message.parts()` when present and falls back to `message()` for
plain-text messages.
