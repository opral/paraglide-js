# Replay output ablations

These scripts are research harnesses, not product transforms or migration APIs. Run from the Paraglide repository root with Node 22, frozen repository/benchmark dependencies and built `dist`; use the pinned app installations in the parent real-app README.

For the AnythingLLM representations and reachability probes:

```sh
node benchmark/real-apps/round2-experiments/prepare-inputs.mjs /absolute/path/to/pinned/anything-llm
node benchmark/real-apps/round2-experiments/rich-sweep.mjs
node benchmark/real-apps/round2-experiments/specialization-sweep.mjs
node benchmark/real-apps/round2-experiments/reachability-sweep.mjs
```

The input preparation derives catalog bundles with the existing app-specific generator, and writes only `.real-apps/round2`. It includes all ordinary, plural and rich patterns, but the experiments exercise selected subsets using sample inputs. They compare final emitted code to its own compiler control, not full native i18next or production pages.

For the matrix representation probes, first generate the pinned three component fixtures into the current worktree:

```sh
node benchmark/real-apps/run.mjs drawdb /absolute/path/to/drawdb dispatch-matrix dist
node benchmark/real-apps/run.mjs memos /absolute/path/to/memos dispatch-matrix dist
node benchmark/real-apps/run.mjs anything-llm /absolute/path/to/anything-llm dispatch-matrix dist
node benchmark/real-apps/round2-experiments/dictionary-sweep.mjs
node benchmark/real-apps/round2-experiments/serialization-sweep.mjs
```

All five sweeps use this worktree's Vite 8.1.4; the rich/reachability sweeps additionally use benchmark Vite 6.4.1. Matrix figures therefore hold Vite 8 constant even for AnythingLLM, whose production Vite 4 A/B is separate. Experimental outputs and JSON are written under `.real-apps/round2/experiments`, while the committed original captures are `../results/round2-*.json`. Input exclusions match the original component fixture.

`specialization-sweep` deliberately changes its exports to estimate an upper bound. `prune-rich` is a provisional research pass with documented scope/ownership/mutation gaps; **it must not be installed in application production builds**. The successful fixture parity does not establish general compatibility. See [the experiment ledger](../round2-output-experiments.md) for outcomes and publication gates.
