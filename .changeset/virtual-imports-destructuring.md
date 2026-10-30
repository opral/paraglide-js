---
"@inlang/paraglide-js": patch
---

Rewrite `const { key } = m` (and other object patterns that read the namespace whole) and fully static template-literal keys such as ``m[`key`]`` to direct virtual message imports. Before, both kept the whole message barrel: in development every message module loaded, and a production build that destructured `m` bundled the entire catalog.
