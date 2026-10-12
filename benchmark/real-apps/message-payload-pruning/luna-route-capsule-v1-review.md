# Luna review of the frozen V1 route-capsule prototype

GPT-6 Luna, extra-high reasoning, reviewed the source and archived evidence read-only. The reviewer ran no builds or browser measurements and made no edits. This review applies to `route-capsules-prototype.patch` with SHA-256 `26be94f163fa79f6d707cc9d83cbc1d895472702f94c3522b01413ba1654e934`, not the subsequent working V2 prototype.

The initial review overstated static-payload duplication. After checking the actual call sites and artifacts, the reviewer withdrew that blanket finding: the plugin passes a global **dynamic** index set to locale-array pruning. Fully static keys, including the lazy fixture key, leave all locale JavaScript and appear in their chunk's JSON capsule. Decoded output checks, plus the original independent text search, verify this behavior. The fixture byte result remains valid within its declared scope.

A narrower duplication remains: a live message that is static in one locale and formatted/dynamic in another enters the global dynamic-index set. Its static locale value can remain in JavaScript and also appear in its capsule. The follow-up mixed-variant probe confirms this limitation. Per-locale dynamic-index and capsule-membership decisions would be needed to remove that duplication.

The following V1 findings remain material before any product implementation:

- Development does not run `renderChunk`, leaving build-time markers unresolved. A development implementation or an explicit build-only guard is required.
- Predictable string markers are replaced without adequately isolating compiler provenance; a matching user string could be rewritten.
- Build/watch generations can retain stale parsed metadata and emitted-asset reference caches.
- A failed lazy capsule fetch rejects wrapper top-level await. Clearing the fetch promise does not recover the cached failed ESM evaluation. The archived HTTP 503 test confirms both the initial import and retry reject.
- The rendered-graph/grouping integration covers Vite 8.3.4 only. Older supported peer versions, arbitrary output graphs, CSP `connect-src`, URL base/CDN behavior, and multi-project behavior remain unverified.

The group-registry key uses the actual base locale. German-base and no-English full-catalog checks pass; the no-English whitebox probe registers two distinct groups. Previously requested explicit locales also load for later groups, but retaining every requested locale can increase subsequent lazy-route traffic.

These are private feasibility results using full catalog input in a small static-consumer fixture. They do not establish a production page-load improvement, a whole-app migration advantage, or qualification for another source PR. The V2 recovery/marker/cache experiments must retain separate source hashes, artifacts, and reviews.
