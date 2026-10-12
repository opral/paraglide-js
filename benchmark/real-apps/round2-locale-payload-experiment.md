# Private selected-locale payload experiment

Twelve further build cells compare three payload representations across two actual AnythingLLM catalogs and Vite 6.4.1 / 8.1.4. Each cell keeps all 1,257 exports and the existing locale packing pass, Vite minification and compression settings constant. Only the internal payload container changes: function values, strings for static messages plus functions for dynamic/rich messages, or an indexed array of those values. This is research code, not a public compiler option.

For Vite 8, indexed arrays reduce the selected English payload from 20,027 to 16,156 Brotli-Q4 bytes (19.3%) and French from 22,264 to 18,570 (16.6%). Object values save only 2.8% and 2.6%. Vite 6 retains more function overhead and the array results improve 42.1% / 38.1%. These are locale-payload comparisons, **not whole-route savings or page-load results**. No browser replay or startup CPU improvement is established.

All 1,199 English and 1,198 French static strings match their generated-function results in each build. Dynamic functions, rich parts, plural branches and public facade compatibility still need separate validation before any production change. This removes closure/container overhead without shortening strings before Vite; the Vite 8 object-value result also shows why raw source reductions are insufficient evidence.

Replay after copying a pinned, locale-modules AnythingLLM compiler output into `.real-apps/payload-experiment/input`:

```sh
node benchmark/real-apps/round2-experiments/locale-payload-sweep.mjs
```

The experiment expects the same 1,257-key catalog from the [locale splitting work](locale-split-experiment.md). Public captures, version-specific output hashes and limitations are in [round2-locale-payload-sweep.json](results/round2-locale-payload-sweep.json).
