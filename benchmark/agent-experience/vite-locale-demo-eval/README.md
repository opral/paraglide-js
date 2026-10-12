# Vite locale split task archive

This directory contains the portable fixture, its production-browser verification script, and the observed results from all three task turns. The fixture is isolated from the original demo and does not include generated Paraglide output, a `dist` directory, or `node_modules`.

- [`fixture/`](./fixture/) is the runnable Vite app.
- [`fixture/scripts/verify.mjs`](./fixture/scripts/verify.mjs) checks the German greeting preview, saved French startup, plural counts, requested locale chunks, document navigations, and page errors against a production preview.
- [`results.md`](./results.md) records the build and browser results observed in each turn.

See the fixture README for replay instructions and the `PARAGLIDE_COMPILER_PATH` setup variable.
