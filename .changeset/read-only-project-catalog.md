---
"@inlang/paraglide-js": minor
---

Compile directory projects through the SDK's read-only catalog API when available, bypassing database import, commits, and nested-message queries. Add `compileCatalog()` for detached settings and bundles. Existing `compileProject()`, older published SDKs, and offline plugin caches remain supported.

Add opt-in `messageModuleSize` grouping for `message-modules` output, including `--message-module-size` in the CLI. Groups share message dispatch and types while retaining named exports, input types, metadata, documentation, and per-message tree shaking. The default remains one message per file; grouping changes direct generated module paths, so import messages through `messages.js`.

On a local three-locale benchmark with declarations and real disk writes, default-layout fresh builds fell from 3.54 s to 583 ms for 6,400 keys and from 6.90 s to 1.15 s for 13,300 keys (about 83% less time, 6× faster). With `messageModuleSize: 512`, builds took 82 ms and 148 ms (about 98% less time than the released default stack). Default-layout JavaScript and declarations matched byte-for-byte. These are medians of five rotated, serial fresh-process trials against the released SDK 4.0.4 stack, using the locally linked updated SDK and message-format plugin. Module imports are recorded separately; fixture setup is excluded. See `benchmark/project-catalog/round2` for raw results, complete CLI measurements, Grai comparisons, and limitations.

Defer database SDK, UUID, initialization, and optional config-loader work until needed. The fastest catalog path requires the updated SDK and plugin; compatible fallback paths remain available. No incremental compilation is introduced.
