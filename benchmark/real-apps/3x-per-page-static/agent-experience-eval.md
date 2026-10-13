# GPT-6 Luna xhigh: two-turn agent experience evaluation

This evaluation used an isolated real Vite project and the frozen experimental
compiler. The agent could read architecture/public API docs but not compiler
implementation or the author's integration tests. It did not edit public source.

Turn 1: configure two locale builds and import a synchronous physical greeting.
Actual `createBuilder().buildApp()` succeeded for en-US and es-ES; each emitted
JS had its selected greeting and none of the other locale's greeting. One retry
was needed after placing catalogs inside project.inlang/messages instead of the
scaffold's sibling messages directory. The agent also inferred the Vite builder
invocation because it was absent from the architecture doc. Both documentation
gaps were subsequently fixed in the draft compiler change.

Turn 2: add a dynamic-import page with a distinct localized message, then a link
to the other locale's HTML graph. The actual build succeeded without a retry.
Manifest/static-closure checks show no lazy message in initial assets; each lazy
chunk contains only the selected locale's text. URL/manifest checks confirm both
language switch links resolve correctly under /app/. The agent understood why a
full-document navigation is needed instead of setLocale within a fixed graph.
No browser was used for this isolated DX fixture; its switch-link claim is URL
resolution, not a complete production deployment test.

Separate integration review found the login known-key registry safe under the
full-reload contract, but emphasized that automatic registration belongs in a
production compiler API. The private registry does not solve panel/subpage
unknown dynamic keys; those entries still preload the full catalog. These are
remaining product/DX limitations, not successful evaluations of a nonexistent
automatic dynamic-key API.
