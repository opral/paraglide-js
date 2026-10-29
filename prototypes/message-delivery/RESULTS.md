# Message delivery results

Follow-up: [individual virtual messages with one messages.d.ts](./SINGLE-DECLARATION.md) tests the eight-file design and includes large-catalog TypeScript checks.

Measured on an Apple M5 Pro, darwin arm64, Node 24.22.1, Vite 8.1.4. Three runs per scenario. Raw observations and metadata are in [plain.json](./results/plain.json) and [mixed.json](./results/mixed.json). The raw files also include 1,000-message runs, server startup, warm/no-op work, bundle build times, and one-message bundle sizes.

## Findings

1. Grouping is the strongest first step for reducing compile/write work and Vite graph size. At 6,400 plain messages, groups of 64 reduce disk files from 12,811 to 211, generation/prepare/write from 529 ms to 33 ms, and the dev graph crawl from 1,016 ms to 167 ms. Groups of 256 reduce file count further.
2. Virtual modules solve disk publication, not module count. Independent virtual messages still create about one Vite module per message. Keeping declarations unchanged also leaves thousands of declaration files on disk. Grouping declarations separately fixes that disk count but leaves the large JavaScript graph.
3. Grouping plus virtualization removes more disk files, with much smaller graph differences than switching from independent to grouped messages. At 6,400 plain messages, virtual groups of 64 write 110 files instead of 211. The supporting runtime and declarations remain real files.
4. Production size does not have a universal winner. For the 6,400-message plain catalog, using 10% of messages gives 6,662 gzip bytes with independent modules and 10,889 with groups of 64. For mixed messages, grouping reduces the corresponding bundle size. The existing grouped emitter also introduces shared factories and other code-generation changes: this comparison is not an isolated test of file concatenation. Unused-message elimination still succeeds; a larger bundle is not itself evidence of lost tree shaking.
5. Incremental edits matter. The existing independent-message emitter patches changed message output; grouped layouts currently regenerate the full catalog. Virtual independent messages with separately packed declarations preserve that compiler fast path, but packing/partitioning still traverses the output. Timings include those costs.

## Recommendation

Keep the public default unchanged in this prototype PR. Grouped output is the best candidate for a broadly useful follow-up, using the existing `messageModuleSize` mechanism before introducing another overlapping output option. Compare 64 and 256 on real application catalogs and inspect why simple-message production bundles grow before changing a universal production default.

For Vite development, grouped modules are promising against the current locale-modules default too: the graph can have more nodes but substantially less generated code to process. Virtual groups are a plausible optional transport after integration work, rather than a reason to default to thousands of independent virtual modules.

If a single default cannot achieve acceptable production size and dev latency, evaluate a grouped development layout with independent production modules. That would be an explicit dev/build policy decision, not a performance conclusion silently applied here.

The tables below use the [measurement boundaries](./README.md#measurement-boundaries). In particular, the graph crawl is not browser startup; edit times exclude watcher delivery and subsequent graph transformation. These synthetic results justify further experiments, not universal speed claims.

### 6,400 messages, plain

| Variant                  | Disk files | Dev modules | Generate + prepare + write ms | Dev graph crawl ms | Edit compile + prepare + write ms | 10% usage gzip bytes |
| ------------------------ | ---------: | ----------: | ----------------------------: | -----------------: | --------------------------------: | -------------------: |
| disk-message             |      12811 |        6404 |                         528.8 |             1016.1 |                              26.7 |                 6662 |
| disk-group-16            |        811 |         404 |                          59.8 |              237.2 |                              24.1 |                11223 |
| disk-group-64            |        211 |         104 |                          32.6 |              167.2 |                              19.0 |                10889 |
| disk-group-256           |         61 |          29 |                          25.5 |              153.3 |                              21.9 |                10845 |
| disk-locale              |         16 |           7 |                          75.9 |              489.2 |                              87.9 |                13992 |
| virtual-message          |       6410 |        6404 |                         281.2 |              634.0 |                              18.7 |                 6662 |
| virtual-message-types-64 |        110 |        6404 |                          60.0 |              629.0 |                              13.5 |                 6662 |
| virtual-group-64         |        110 |         104 |                          29.6 |              154.9 |                              17.9 |                10889 |

### 20,000 messages, plain

| Variant                  | Disk files | Dev modules | Generate + prepare + write ms | Dev graph crawl ms | Edit compile + prepare + write ms | 10% usage gzip bytes |
| ------------------------ | ---------: | ----------: | ----------------------------: | -----------------: | --------------------------------: | -------------------: |
| disk-message             |      40011 |       20004 |                        1774.1 |             3410.5 |                              95.8 |                17375 |
| disk-group-16            |       2511 |        1254 |                         191.6 |              754.0 |                              81.3 |                29962 |
| disk-group-64            |        637 |         317 |                         100.0 |              514.5 |                              68.4 |                28926 |
| disk-group-256           |        169 |          83 |                          82.8 |              499.4 |                              71.6 |                28778 |
| disk-locale              |         16 |           7 |                         248.3 |             1573.5 |                             288.9 |                36150 |
| virtual-message          |      20010 |       20004 |                        1001.9 |             2092.7 |                              58.0 |                17375 |
| virtual-message-types-64 |        323 |       20004 |                         190.9 |             2093.6 |                              44.2 |                17375 |
| virtual-group-64         |        323 |         317 |                          84.5 |              486.4 |                              73.0 |                28926 |

### 6,400 messages, mixed

| Variant                  | Disk files | Dev modules | Generate + prepare + write ms | Dev graph crawl ms | Edit compile + prepare + write ms | 10% usage gzip bytes |
| ------------------------ | ---------: | ----------: | ----------------------------: | -----------------: | --------------------------------: | -------------------: |
| disk-message             |      12811 |        6405 |                         593.4 |             1389.5 |                              31.4 |                19963 |
| disk-group-16            |        811 |         405 |                          92.1 |              633.8 |                              60.8 |                16513 |
| disk-group-64            |        211 |         105 |                          72.8 |              557.7 |                              59.3 |                15799 |
| disk-group-256           |         61 |          30 |                          67.6 |              555.1 |                              56.9 |                15777 |
| disk-locale              |         16 |           8 |                         123.3 |              837.9 |                             129.5 |                26303 |
| virtual-message          |       6410 |        6405 |                         338.3 |             1040.6 |                              19.7 |                19963 |
| virtual-message-types-64 |        110 |        6405 |                         100.3 |             1044.4 |                              15.8 |                19963 |
| virtual-group-64         |        110 |         105 |                          62.3 |              518.0 |                              54.5 |                15799 |
