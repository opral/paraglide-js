# Independent review: AnythingLLM adapter

Reviewed the uncommitted adapter and final benchmark artifacts read-only. I did not launch builds. `git diff --check` passed.

There are no blocking defects for the bounded catalog comparison. The adapter reads the app's `resources.common`, keeps the native nested resource shape and property order, and configures the native side with `defaultNS: "common"` and `lowerCaseLng: true`, matching the app's i18n setup. The six unsupported plural keys are excluded on both sides and listed in the output. The final artifacts use source commit `2a10d052a1812d7be12c43f9024072cf26a27a8b`, Vite 4.5.3, and i18next 23.12.1.

The Vite 4 / Rollup render hook uses the supported object-hook form with `order: "pre"`. The result confirms it changed the linked locale-functions chunk (13,126,304 input bytes). All 38,688 included key/locale pairs match in each final bundle, with 4,992 additional checks after switching among `en`, `de`, `bg`, and `zh-tw`. Packed locale output is 642,573 gzip / 476,554 Brotli bytes against 742,646 / 582,828 for the matching locale baseline; native i18next is 725,623 / 511,597 bytes.

These figures support an isolated catalog result, not a whole-app result. The harness bundles every included catalog key into one entry. Its French `/onboarding` route capture is native-only and uses read-only API fixtures; it confirms baseline rendering and resource sizes, but does not compare a migrated route or measure paired page performance. The adapter also does not establish plural behavior for the six excluded keys, rendered `<Trans>` component parity, browser detector behavior, or regional-locale/fallback behavior after migration. The report correctly discloses these limits.

One reproducibility gap: the checked result JSON omits the packer's elapsed time even though `run.mjs` records it in `packingChunks`. Preserve that field in the published result if build-time cost is in scope. A migration claim should wait for an app-level route build with language-switching and region/fallback parity, plus the same route's loaded-resource comparison.

Author follow-up: the final run's packing duration is now preserved separately in `results/anything-llm-packing-diagnostic.json`; the report also records the observed build-time range. Deterministic byte/parity files still exclude timing.
