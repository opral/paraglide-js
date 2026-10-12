# Ntfy selected-only startup experiment

This private probe tested whether the locale-split client can skip loading the base-locale module at startup when the selected-locale output already includes compiler-resolved fallback messages. The candidate changes only the generated `startupLocalePromise`: it loads the selected locale and leaves explicit `loadLocale()` and `setLocale(..., { reload: false })` behavior in place. It is not a public API or a production-app A/B.

The fixture uses all 473 message IDs from Ntfy’s pinned English catalog, compiled for `en`, `fr`, and `de`. Its page is a small Vite app that imports representative static, interpolated, plural, rich-text, and lazy-route messages. The production app has 51 locales; this fixture intentionally exercises only three. Ntfy is pinned to `211ba22860d7483073a8ce13dcda5f467194989b`.

## Initial French route

Cold request-body bytes include the HTML document and every resource actually requested by the browser. Brotli uses quality 4; gzip uses level 6.

| Variant | Requests | Raw bytes | Gzip bytes | Brotli Q4 bytes |
| --- | ---: | ---: | ---: | ---: |
| Base plus selected locale | 8 | 104,994 | 21,691 | 21,557 |
| Selected locale only | 7 | 82,432 | 15,793 | 15,552 |
| Change | −1 | −22,562 (−21.49%) | −5,898 (−27.19%) | −6,005 (−27.86%) |

The 6,005-byte Brotli reduction is almost entirely the initially omitted English module (5,995 bytes compressed). The core/runtime difference is only 11 Brotli bytes. This is an initial-route fixture result, not a claim about Ntfy’s full production route or its startup time.

The candidate fetched the English module when the fixture activated a lazy route; the control already had it. So this experiment shifts that module out of the initial request graph rather than removing the need to transfer it for every consumer. The synthetic post-lazy-route graphs are effectively the same size.

## Compatibility and checks

Both variants rendered the same captured French text, placeholder, plural, and rich `.parts` output. The fixture switched French → German → English → French, activated a lazy route, and asserted exact sample output and `html.lang` at each step. Neither run recorded page errors or console errors.

The experiment exposes an API compatibility cost: before an explicit English preload, the control can call `k0({}, { locale: "en" })`; selected-only startup throws `Paraglide locale "en" is not loaded. Await loadLocale() before calling its synchronous messages.` Calling `await loadLocale("en")` restores that behavior. Consumers that rely on per-call locale overrides before startup must therefore keep the base preload or add explicit loading.

This fixture does not test SSR, load races/retries, all 51 locales, or a real Ntfy UI route. It uses a minimal page and a representative subset of callsites, even though each generated catalog carries all 473 keys. It measured bytes only, not paint or readiness. The apparent percentage is amplified by the tiny test page, and no production migration claim follows from it.

## Reproduction and provenance

Run `selected-startup-ntfy-fixture.mjs` from this checkout with Node 22.23.2, the pinned Ntfy web directory, and one of the prepared compiler output trees. It invokes the pinned app’s Vite 8.3.4 and Playwright installations. Example control command:

```sh
NTFY_PROJECTION_SOURCE=/root/repos-iii/ntfy-native-ab/web \
PARAGLIDE_DIST_ROOT=/root/repos-iii/paraglide-selected-startup-probe/.real-apps/selected-startup/control \
NTFY_PLUGIN_SOURCE_DIFF_SHA256=e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855 \
NTFY_PLUGIN_SOURCE_SHA256=ee1d4b4b694109ce4c444c2258e8e70578a69cb4d2c29792ace05061b3e356b2 \
NTFY_PROJECTION_MODE=split NTFY_ALL_MESSAGES=1 \
NTFY_FIXTURE_OUT=/root/repos-iii/paraglide-selected-startup-probe/.real-apps/selected-startup/control/fixture \
NTFY_RESULT_PATH=/root/repos-iii/paraglide-selected-startup-probe/.real-apps/selected-startup/control/report.json \
node benchmark/real-apps/message-payload-pruning/selected-startup-ntfy-fixture.mjs
```

For the candidate, use the `selected` paths and set `NTFY_PLUGIN_SOURCE_DIFF_SHA256=339a999ae1878af7548eb7145f74256b038ee4c814b709573cc170f693dd2ed9` and `NTFY_PLUGIN_SOURCE_SHA256=71253017b994606882470094b854ce28713f854d4a82ac17568ce5da2939f656`.

Both runs use compiler source commit `b95dff8a4f24378cbc4bf5b697ecb64cde53093f`, with an empty source diff for the control and the private plugin-only diff for the candidate. The public plugin entry leaf is `72884458211415a046050e655997ed49caaf56b7697012790dab084d32a62bc1`; the locale-split plugin leaves are `c06f8dd894f68f6040deeb8ff62d449d4b133fb12bb78520dd5e7f9a5c49dd70` (control) and `ab141f67aae839434e39b5a435bac83b57f80755a92ce39a558bf5daf3b09064` (candidate). The fixture build-tree hashes and individual resource hashes are recorded in the raw JSON:

- [Control capture](results/selected-startup-control.json)
- [Selected-only capture](results/selected-startup-only-selected.json)

The compiler edit is preserved as [selected-only-startup.patch](selected-only-startup.patch). It applies after the separate [static fallback metadata patch](../static-fallback-metadata-prototype.patch), which supplies this probe’s control metadata. Apply both only in an isolated checkout and rebuild separate control/candidate dist trees; the fixture script takes their paths through `PARAGLIDE_DIST_ROOT`. The public compiler in this draft does not enable this behavior. The compiler edit was recorded on the private `experiment/selected-only-startup` branch. It is not part of the static-fallback metadata archive commit and should not be treated as an approved default behavior.
