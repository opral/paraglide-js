# Three-turn results

These are the observed results from the three sequential tasks using the isolated Vite fixture and the unreleased compiler checkout at `/root/repos-iii/paraglide-client-split-current-api`. The app build used Vite 8.3.4; browser checks used headless Chromium through Playwright 1.64.0. The fixture and replay script are in [`fixture/`](./fixture/).

## Turn 1: startup locale chunks and English fallback

Production build passed. Browser checks observed:

- No saved preference: English title, greeting, and count were correct; only the English locale chunk was requested.
- Saved French preference: the first render was French; only the English base and French chunks were requested.
- Switching to German persisted the preference and the next startup rendered the German title, greeting, and count; only English and German locale chunks were requested.
- An invalid saved locale (`xx`) fell back to English and requested only the English locale chunk.

Turn 1 did not record document navigations or page errors.

## Turn 2: in-place locale switching

Production build passed. The browser increased the English count from 2 to 5, then switched English → French → German in place. The German and French greetings and titles were correct, and the count remained 5 throughout. The selected German locale persisted through an explicit reload; after reload, the app started in German with its initial count of 2.

- Locale chunks: `en`, `fr`, and `de`.
- Document navigations: 2 total, the initial load and explicit reload; the language switches caused no navigation.
- Page errors: none.

## Turn 3: German greeting preview and French plural counts

Production build passed. The browser started with no saved preference, loaded the German greeting preview, switched the active locale to French in place, then reloaded with French saved and exercised counts 2, 1, 0, 1, and 2. The preview displayed `Willkommen, Alex.` while the active locale and stored preference remained English.

Observed output from `npm run verify`:

```json
{
  "result": "passed",
  "previewUrl": "http://127.0.0.1:4173",
  "germanPreviewText": "Willkommen, Alex.",
  "activeLocaleAfterPreview": "en",
  "storedLocaleAfterPreview": "en",
  "requestedLocaleChunks": ["en", "de", "fr", "en", "fr"],
  "documentNavigations": [
    "http://127.0.0.1:4173/",
    "http://127.0.0.1:4173/"
  ],
  "countChecks": [
    {"value": 2, "text": "2 livres dans votre liste"},
    {"value": 1, "text": "1 livre dans votre liste"},
    {"value": 0, "text": "Aucun livre dans votre liste pour le moment"},
    {"value": 1, "text": "1 livre dans votre liste"},
    {"value": 2, "text": "2 livres dans votre liste"}
  ],
  "pageErrors": []
}
```

The locale chunk request list includes the English startup chunk, German preview chunk, French chunk loaded during the in-place switch, and English/French chunks requested again on the explicit reload. The two document navigations are the initial load and that explicit reload.

## Replay notes and limits

Set `PARAGLIDE_COMPILER_PATH` to a built local compiler checkout and run `npm run setup` in `fixture/`, then install Chromium, run `npm run build`, start `npm run preview`, and run `npm run verify`. The setup script runs `npm ci` and then overrides only the installed compiler; the committed package manifest and lockfile remain independent of any machine-specific checkout path.

One setup friction was that a temporary `npm install --no-save <local-checkout>` override can be replaced by a later npm install when the manifest still names the published compiler. The setup script handles this order explicitly. The locale split remains experimental and currently loads complete base and selected locale modules, as documented by the compiler.
