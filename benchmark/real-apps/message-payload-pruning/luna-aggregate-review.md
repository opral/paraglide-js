# Private aggregate prototype review

GPT-6 Luna at extra-high reasoning reviewed the private aggregate prototype on
2026-10-12. The reviewed source is `728f4300485de3dfb85b9d200183e2039f601d19`;
this review does not describe a published compiler option.

The reviewer inspected the implementation and its recorded Vite 8.3.4 browser
fixture. French startup, rich parts, plurals, a late route, and French → German
→ English → French switching passed. Computed namespace access conservatively
keeps every message. Sparse arrays preserve indexes and length, with runtime
validation restricted to live slots.

Two verified limitations remain:

- Liveness includes every rendered chunk, including lazy routes. Their messages
  remain in the initial selected-locale payload; this does not solve per-route
  translation delivery.
- Only Vite 8.3.4 is verified. The prototype uses Rolldown code-splitting groups;
  the package's general Vite peer range is not evidence of feature compatibility.
  Actual build evidence confirms the fourth `renderChunk` argument contains the
  full chunk graph despite the installed Rolldown type declaring three arguments.

The reviewer also raised a source-map concern: the pruning pass emits a
MagicString map naming the generated chunk. Whether the bundler correctly
composes that map back to original module locations requires a sourcemap-enabled
build and position tracing. This is an unresolved concern, not a reproduced bug.

The small-use fixture cannot establish a production migration advantage. The
actual Ntfy bridge dynamically indexes all messages, and its diagnostic route
comparison misses the campaign's >10% gate. No source PR qualifies from this
review. The fixture does not explicitly record document navigation counts.
