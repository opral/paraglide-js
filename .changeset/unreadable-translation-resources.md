---
"@inlang/paraglide-js": patch
---

Fail `compile()` when a translation resource file exists but cannot be read, for example because of missing permissions. Previously the error was only logged as a warning after the output had been written without those translations. Missing resource files are still skipped, and the previous output is kept until the file can be read again.
