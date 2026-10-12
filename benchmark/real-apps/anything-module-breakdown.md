# AnythingLLM final migration module breakdown

This report uses the final clean-catalog migration and a native metadata-only control from the same app commit and frozen dependencies. The only difference in the native control's language hook is that the locale-ID list is static instead of being read from `Object.keys(resources)`; native i18next initialization remains unchanged and still includes all translation catalogs.

| Main bundle family                                 |   Native metadata control |        Paraglide migration |
| -------------------------------------------------- | ------------------------: | -------------------------: |
| Locale catalog modules in all JS chunks            | 31 / 2,574,707 rendered B |                    0 / 0 B |
| Modules with `i18next` or `react-i18next` paths    |   17 / 122,970 rendered B |                    0 / 0 B |
| Generated Paraglide message modules in main        |                         0 | 168 / 1,436,199 rendered B |
| Generated Paraglide message modules in all chunks  |                         0 | 950 / 5,612,593 rendered B |
| Generated keys absent from emitted graph           |                       n/a |               307 of 1,257 |
| Paraglide runtime/registry/adapter modules in main |                         0 |      5 / 54,416 rendered B |
| Rollup main-entry module count                     |                       434 |                        559 |

The 16 rich `Trans` message modules account for 641,033 rendered bytes, or 44.6% of the main entry's generated message-module bytes. They keep both ordinary string output and rich-parts output needed to render translated React elements. This is useful overhead to investigate separately; removing it would change the source app's `<Trans>` behavior.

The five shared Paraglide modules in the main entry are `dynamic-messages.js` (26,330 B), `runtime.js` (18,882 B), `i18n.js` (3,865 B), `registry.js` (3,072 B), and `react-compat.js` (2,267 B). The largest ordinary application modules are unchanged in both builds: `@remix-run/router/dist/router.js` (158,741 B) and `react-dom/cjs/react-dom.production.min.js` (133,480 B). The largest generated messages are:

| Rendered bytes | Message key                                      | Generated module |
| -------------: | ------------------------------------------------ | ---------------- |
|         53,272 | `model-router.rules.calculated-single-condition` | `k922.js`        |
|         44,762 | `agent.mcp.tool-count-warning`                   | `k12.js`         |
|         44,486 | `model-router.rules.calculated-multi-condition`  | `k919.js`        |
|         43,153 | `model-router.rules.llm-rule-body`               | `k929.js`        |
|         40,694 | `model-router.chat.routed-to-rule`               | `k816.js`        |
|         40,251 | `telegram.setup.step1.description`               | `k1202.js`       |

The final `index.js` measures 3,496,674 raw / 984,391 gzip / 882,395 Brotli Q4 bytes for native metadata control and 1,525,691 / 374,826 / 364,213 bytes for Paraglide. On the controlled `/onboarding` route, the latest paired production run recorded 1,004,360 B of same-origin subresource transfer natively and 486,178 B with Paraglide (encoded bodies plus headers, excluding the HTML document) (-51.6%); median FCP/LCP was 764 ms and 532 ms (-30.4%). Three five-pair runs are retained; pooled 15-trial FCP/LCP medians were 776 ms and 532 ms (-31.4%). See `results/anything-llm-app-browser.json` and `results/anything-llm-app-cross-replicates.json` for the full latest run and earlier cross-replicates.

The earlier catalog-retaining migration inventory is preserved in `artifact-breakdown.md` and is explicitly marked superseded. The corrected result depends on switching the app's locale picker from a resource-object import to Paraglide's exported `locales` metadata; the generated catalogs no longer remain in the browser bundle. No `@inlang`, `@lix`, `i18next`, or `react-i18next` module paths appear in the final Paraglide output. This is one local production route, not field data or a whole-app average.

Inventories: `native-metadata-control-all-modules.json` and `paraglide-clean-catalog-metadata-all-modules.json`. Build and compiler hashes are in `results/anything-llm-app-pin.json`; inventory tables summarize ignored full build artifacts.
