# Two-turn generated-message integration evaluation

**Evaluator:** GPT-6 Luna, extra-high reasoning. **Source:** same PR3 worktree and refreshed compiler/plugin `dist` reviewed in `luna-dispatch-review.md`. This was a concrete local Vite/browser probe, not a blind study: generated messages were compiled from a small three-locale project and exercised in Chromium 143.

## Turn 1

**Prompt:** “Here are generated messages and locale selection; reduce shipped JavaScript without changing language-switch behavior.”

I used the ordinary generated message functions and runtime locale API in a Vite entry. The integration was direct and needed no compiler flag or custom message wrapper: import the generated message, call it normally, and call `setLocale`/`getLocale` from the generated runtime. Vite runs the packing pass internally after chunking; the application does not reference its private markers or tables.

The test entry imported `static_0`, an interpolated message, and a markup message from generated `message-modules`. It also declared a `loadLazy()` function that dynamically imported a second module containing the remaining static messages. Before calling `loadLazy`, the browser had made no request for the lazy chunk.

## Turn 2

**Prompt:** “The compiler now returns literal text directly. Integrate the regenerated messages without changing language switching; are any new compiler flags or message-call changes needed? Verify en→de→en and an explicit locale override.”

No new application flag or message-call change was needed. The test kept the normal call shape and used the existing runtime selection API:

```js
setLocale("en", { reload: false });
const first = static_0();
setLocale("de", { reload: false });
const second = static_0();
setLocale("en", { reload: false });
const third = static_0();
const explicitGerman = static_0({}, { locale: "de" });
```

In Chromium, baseline and packed builds matched on Vite 4.5.3, 6.4.1, and 8.1.4. The sequence returned `English 0`, `Deutsch 0`, `English 0`; `getLocale()` remained `en` after the explicit German call. An unknown string and `new String("de")` both selected the Spanish base, proving the override did not coerce other values and did not alter the active locale.

The interpolated message returned `Hallo Ada`. The markup message returned `Hinweis`, and `.parts()` retained the exact `markup-start`, `text`, and `markup-end` structure in both builds. Calling the lazy importer caused exactly one lazy-chunk request and returned all 21 expected English messages. There were no browser page errors.

The normal generated API was intuitive for this flow: global language switching stays in `setLocale`, an explicit per-call language stays in the second options object, and lazy route imports remain ordinary JavaScript imports. The test did not require application code to know that the Vite build packs static locale dispatches.

## Final guarded-pass browser follow-up

**Evaluator:** GPT-6 Luna, extra-high reasoning. I rebuilt the refreshed candidate with an 8-locale, 58-bundle project containing 40 static messages in the initial chunk, 16 static messages in a lazy chunk, one interpolation, and one markup message. For Vite 4.5.3, 6.4.1, and 8.1.4, the standard compiler build and Vite-plugin build were served to Chromium 143.0.7499.4 and exercised through the ordinary generated functions and runtime APIs; no compiler flag or altered message-call signature was used.

Both builds returned the same values for all 40 initial messages in English and German, and for all 16 lazy messages in German. `setLocale("en") → setLocale("de") → setLocale("en")` returned English, German, English and left `getLocale()` at `en`. An explicit `{ locale: "de" }` returned German without changing the active locale; an unknown string and `new String("de")` both fell back to English. Interpolation returned `Hallo Ada`. Markup returned `Hinweis`, and `.parts()` retained matching markup-start/text/markup-end records. The lazy chunk was not requested before import and was requested exactly once after import. Neither build had browser errors.

The optimized initial chunk was 1,859 raw bytes smaller on Vite 4 and 6, and 2,411 bytes smaller on Vite 8. The 16-helper lazy chunk was unchanged on all three versions because it was below the per-chunk gate. Browser output parity was exact. Detailed Vite 8 fixture data are in `.real-apps/luna-final-ax-8.1.4/ax-results.json`; Vite 4 and 6 transcripts are in `.real-apps/luna-final-ax-4.5.3/ax-results.json` and `.real-apps/luna-final-ax-6.4.1/ax-results.json`. The ignored driver is `.real-apps/luna-final-ax.mjs`.
