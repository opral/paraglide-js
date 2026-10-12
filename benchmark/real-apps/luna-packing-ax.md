# Multi-turn API evaluation: generated messages in Vite

Environment: ignored scratch app at `.real-apps/luna-packing-ax`, Vite 6.4.1, generated `locale-modules`, and the refreshed final `.real-apps/packed-compiler` snapshot. The app now calls 16 static messages in the entry chunk, enough to exercise the final per-locale packing gate. I inspected the supplied generated baseline and used the documented `messages.js` and `runtime.js` APIs. The app never imports a private helper.

The relevant public docs are [Paraglide basics](https://paraglidejs.com/basics) and [Compiling messages](https://paraglidejs.com/compiling-messages). They describe ordinary generated message calls, runtime locale selection, and Vite plugin setup.

## Turn 1

Prompt: “Here are generated messages and locale selection; reduce shipped JavaScript without changing language-switch behavior.”

I kept the normal generated message namespace and locale controls:

```ts
import * as m from "./paraglide/messages.js";
import { getLocale, setLocale } from "./paraglide/runtime.js";

m.greeting({ name: "World" });
m.choice_a();
m.choice_b();
// The entry also calls fourteen static tile_* messages through m.
setLocale("de");
```

The Vite project used the existing `paraglideVitePlugin({ project: "./project.inlang" })` setup with `locale-modules`. I did not add a compiler option, change message calls, or import generated implementation details. The API split is easy to follow: messages come from `messages.js`; locale state comes from `runtime.js`.

The refreshed production build logged a packed row in the entry chunk and left the lazy route as a separate chunk. The entry was 7,381 raw / 3,103 gzip bytes and the route chunk 132 raw / 141 gzip bytes. These are candidate fixture sizes, not a baseline comparison or a performance claim.

## Turn 2

Prompt: “The compiler now returns literal text directly. Integrate the regenerated messages without changing language switching; are any new compiler flags or message-call changes needed? Verify en→de→en and an explicit locale override.”

I rebuilt through the existing Vite plugin and kept the same public calls:

```ts
import * as m from "./paraglide/messages.js";
import { getLocale, setLocale } from "./paraglide/runtime.js";

m.greeting({ name: "World" });
m.greeting({ name: "World" }, { locale: "de" });
const staticMessages = [
	m.choice_a(),
	m.choice_b() /* fourteen m.tile_*() calls */,
];
await setLocale("de");
await setLocale("en");
```

No new flag or message-call change was needed. The Vite path handles optimized output internally; generated messages used through `messages.js` and locale switching through `runtime.js` remain unchanged.

I used headless Chromium against the refreshed build. The probe verified all 16 static messages and the greeting after each locale transition, an explicit German override, and a lazy route in both locales:

```json
{
	"initial": {
		"active": "en",
		"greeting": "Welcome World!",
		"override": "Willkommen World!",
		"staticCount": 16,
		"firstStatic": "New project",
		"lastStatic": "Add filter"
	},
	"routeEn": "English help page",
	"de": {
		"active": "de",
		"greeting": "Willkommen World!",
		"override": "Willkommen World!",
		"staticCount": 16,
		"firstStatic": "Neues Projekt",
		"lastStatic": "Filter hinzufügen"
	},
	"routeDe": "Deutsche Hilfeseite",
	"backEn": {
		"active": "en",
		"greeting": "Welcome World!",
		"override": "Willkommen World!",
		"staticCount": 16,
		"firstStatic": "New project",
		"lastStatic": "Add filter"
	},
	"routeBackEn": "English help page",
	"errors": []
}
```

The override remains German while the active locale changes back to English. The lazy route loaded the correct text after each transition. Vite emitted separate entry and route chunks; the entry map is a v3 map with 5 sources and embedded content, and the route map has one source and embedded content. This checks map structure, not exact original-column tracing.

## Evaluation boundary

The API was straightforward to use because the optimization required no new app-facing option or generated import. The 16-message fixture exercises the final pass but is not a whole-app performance test. The final DrawDB main artifact remained byte-identical to baseline at 3,165,434 gzip bytes; see the companion review for the Vite 6/8 threshold matrix, direct-eval safety result, and remaining limits.
