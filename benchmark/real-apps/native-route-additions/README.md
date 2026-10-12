# Reproducing the additional i18next route baselines

This read-only survey pins six i18next applications, builds their production client artifacts, inventories their locale catalogs and captures three cold route runs where a web production entry can be served without changing app source.

- [Method, route results and exact pinned build commands](../native-route-additions.md)
- [Capture harness](../native-route-additions.mjs)
- [Full resource graphs, route samples and catalog byte totals](../results/native-route-additions.json)

Build outputs and app checkouts live under the ignored `.real-apps/` directory; the commands in the method note recreate them at the recorded revisions. The capture uses the sibling Paraglide workspace's Playwright install (`benchmark/node_modules/playwright`), 80 ms RTT, 20 Mbps down / 2 Mbps up, 3x CPU, disabled cache/service worker, and Brotli-Q4 for text only. Run from the survey worktree after builds complete:

```sh
node benchmark/real-apps/native-route-additions.mjs
```

Set `NATIVE_ROUTE_TRIALS` to change the default three runs. The route metrics are local production-client observations with backend and third-party traffic unavailable. Open WebUI and Paperclip are explicitly marked shell-only; LosslessCut is build/catalog-only because its Electron runtime was not installed. The captured product UI routes are World Monitor, Chatbox and Stirling-PDF.

If Playwright is installed elsewhere, set `PLAYWRIGHT_MODULE` to its `index.mjs` path before running the capture.
