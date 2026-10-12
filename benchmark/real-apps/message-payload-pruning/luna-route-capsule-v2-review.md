# Luna review of the frozen V2 route-capsule prototype

GPT-6 Luna, extra-high reasoning, reviewed an isolated snapshot of source `6997d020813d76f087d585110e62cd54891726e0` plus the complete V2 patch `de6f9f94586cc861a34bf696be20558e581fd2d4c90bb32011111b4453c4fc76`. The reviewer made no edits and ran no builds or browsers. Later host-compatibility and hardening experiments are separate from this snapshot.

The recovery mechanism looks sound for the exercised graph. The plugin derives each group's identity from sorted live message indexes, traverses static chunk imports with a visited set, and gates a relative literal dynamic import before invoking the original import. It imports the core before calling the runtime gate. A failed capsule promise is evicted; the archived first-503/retry test confirms zero target evaluations on failure and one on success. Stable group identities avoid the empty-base-asset deduplication collision. Unique compiler markers plus exact counts and deterministic output checks address the previous marker/caching problems.

Complete-static extraction is verified. Mixed static/formatted locale rows retain the separately documented duplication; the broad V1 duplication finding was withdrawn.

One concrete atomicity issue remains: `fetchCapsule` checks object keys before the loop, but validates each value's string type while writing into the live locale array. A response containing all expected keys and a non-string later value can reject after earlier assignments. Validate every value before mutating the cache, and test a malformed multi-slot HTTP200 response plus retry. The existing missing-key regression does not cover that case. Failed imports and switches reject, but partial inactive locale state remains until retry.

The snapshot explicitly supports only build mode on the tested Vite 8.3.4 host. A public implementation still needs development behavior, actual host compatibility, computed/non-relative import handling or explicit exclusions, manual-chunk/multi-entry and static-cycle tests, watch and SSR coverage, global bridge isolation, and initial startup recovery. A visited-set traversal prevents infinite graph walks but does not prove every static evaluation cycle is safe. The option exists only in the unapplied private source patch; it is not published.

No real product route or repeated performance gate is established by this review or the fixture. The next hardening revision must preserve fresh source/implementation hashes and separate captures rather than replacing the V2 artifacts.
