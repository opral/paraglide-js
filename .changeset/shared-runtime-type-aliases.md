---
"@inlang/paraglide-js": patch
---

Declarations that hold many messages in one file (`messages.virtual.d.ts`, and `messages/_index.d.ts` and the per-locale files of `locale-modules`) now refer to the runtime's `MessageMetadata` and `MessagePart` types through private shared aliases instead of an `import("…")` type per message. TypeScript locates each `import()` type by walking the file from its first statement, so creating the program took time quadratic in the number of messages.
