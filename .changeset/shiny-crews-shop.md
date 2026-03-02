---
"@inlang/paraglide-js": patch
---

Fix single-locale message generation to avoid emitting an unused `locale` variable in strict TypeScript `checkJs` setups. This removes `TS6133` (`'locale' is declared but its value is never read`) warnings for generated message files when only one locale is configured.

Add a regression type test that asserts single-locale generated messages do not produce this warning.
