# Stirling-PDF project-generation exclusion

## Pinned inputs

- Application source: `Stirling-Tools/Stirling-PDF`, commit `313794c573df5e92d2f020f5ec53d08b264d6e4f`.
- Native frontend stack at that pin: Vite 7.3.6, i18next 26.3.6.
- Failed compiler generation prototype: private-dynamic helper prototype commit `ef0723f` (not published or part of the supported compiler API).
- Runtime: Node.js 22.23.2, `@inlang/sdk` 4.0.0, `@lix-js/sdk` 0.19.0.

## Attempt and result

The project generator imported the pinned app catalogs and attempted `compileProjectForVite` with `outputStructure: "locale-modules"`, `clientLocaleSplit: true`, and the app's `i18nextLng` storage key. Its project contained 9,823 logical message bundles over 42 locales. Generation failed while the compiler read the full bundle query, before any compiler output was written and before Vite ran:

```text
Error [LixError]: buffered read result exceeds its byte or row budget
code: LIX_READ_RESOURCE_EXHAUSTED
details: { maxBytes: 67108864, maxRows: 1000000 }
```

The exact diagnostic command used in the scratch harness was:

```sh
/usr/bin/time -v env \
  STIRLING_PARAGLIDE_OUTPUT=<scratch-output> \
  STIRLING_PARAGLIDE_COMPILER=<private-dynamic-prototype-checkout> \
  node <scratch-harness>/generate-private-dynamic.mjs
```

It ran for 1:51.85 and reached 3,115,820 KiB maximum RSS. The original full command and captured environment-specific paths are retained in the ignored research tree at `.real-apps/stirling-route-two-pass/lix-project-generation.md` in the route-split research worktree. This durable note keeps scratch paths out of the public benchmark archive while preserving the exact error, source pins, input scale, duration, and memory peak.

An older direct `compileBundle` adapter completed in 9.51 seconds at 1,758,768 KiB maximum RSS. That adapter bypassed Lix project generation and `compileProjectForVite`; its output was not consumed by a normal production Vite build. It is an implementation diagnostic only, not a buildable app migration or a performance result.

## Exclusion

The failure is in the Lix-backed project read path, not compiler output generation or the application's Vite build. The campaign explicitly excludes large-project compile failures caused by Lix/Inlang. Do not retry with larger heaps, substitute an SDK, or use the direct-compiler artifact to claim a production result. The independent route experiments are archived as a negative result in [`stirling-route-scope/README.md`](../../stirling-route-scope/README.md) and [`stirling-route-scope-negative.json`](../../results/stirling-route-scope-negative.json); they do not override this buildability exclusion.
