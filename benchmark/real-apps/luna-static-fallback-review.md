# Static fallback metadata prototype review

GPT-6 Luna at extra-high reasoning reviewed private source `8dbb2a5` on
2026-10-12. The final prototype `b95dff8` also hoists the message lookup map once
per bundle, following the review. Neither implementation is enabled in this
draft's compiler source; see the [unapplied patch](static-fallback-metadata-prototype.patch).

No fallback correctness blocker was found. The resolver follows the same chain
as `locale-modules`, stops at the first present message, and leaves dynamic
messages as functions. It normalizes CR/CRLF like existing generated template
literals and preserves the missing-message ID fallback. Single-variant matches
are intentionally ignored by the existing compiler. Markup remains compatible
with the split plugin's text-part handling. Duplicate locales are rejected
earlier, and the resolver also bounds accidental cycles.

The initial report's built-plugin hash identified a separate startup prototype
despite restored source. Its attribution was withdrawn pending a clean rebuild.
The final [report](frigate-static-fallback-results.md) records matching public
plugin hashes, separate compiler hashes, and fresh frozen app outputs. It also
separates raw resource events, distinct URLs, static assets, and mocked API bytes
after the reviewer found an accounting discrepancy.

The final result misses the page-level gate: 34.55% fewer cold localization
subgraph bytes, 24.6% more bytes in the French locale file, and 4.08% fewer static
bytes in a limited health-screen capture. Warm-cache behavior is unmeasured.
This is not a live-dashboard or page-load performance claim.
