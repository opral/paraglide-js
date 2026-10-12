# Chatbox: production route result

Chatbox was built from `Bin-Huang/chatbox@0ac6385ae1ff5bf778777826da3c5edcd55b61b8`. The native renderer resolves `i18next@22.5.1` (`^22.4.13` in `package.json`, 22.5.1 in `pnpm-lock.yaml`) and `react-i18next@12.3.1`; its production web renderer uses Vite 7.3.6 and electron-vite 4.0.1. The Paraglide comparison used compiler tree `ec591218bb814c65e0a9f6a0252f8ec75236aa17`, 15 locales and 1,444 catalog keys.

The browser test is a cold French landing-route comparison of the actual production web renderer builds. It uses Chromium 143.0.7499.4, 80 ms RTT, 20 Mbps down, 2 Mbps up, 3x CPU throttling, local Brotli-Q4 responses, and three fresh-context trials per build. App APIs and third-party requests are blocked. The runner waits for visible French UI (`Épinglés`, `Nouvelle discussion`) before sampling, so an English startup frame cannot pass as a French parity result.

| Median metric | Native i18next | Paraglide split | Change |
| --- | ---: | ---: | ---: |
| Whole-route encoded bytes | 4,049,599 | 3,704,025 | -8.53% |
| Whole-route decoded bytes | 14,278,981 | 12,771,882 | -10.55% |
| FCP | 260 ms | 260 ms | 0.00% |
| LCP | 3,984 ms | 3,708 ms | -6.93% |
| Long-task time | 2,174 ms | 2,164 ms | -0.46% |
| Largest `index.*.js` chunk (encoded) | 3,200,966 | 2,821,339 | -11.86% |

The selected French locale chunk added 36,127 encoded bytes; the route requested 20 resources versus 19 natively. French visible text passed in all six trials with no page errors. A separate browser check switched the settings language from French to English and verified `Épinglés` → `Pinned` and `Nouvelle discussion` → `New Chat`.

This is a negative whole-route result. Only the largest entry chunk clears 10%; route transfer and user-facing timing do not. The 144-key dynamic fallback pruning experiment is invalid because it left the `Pinned` section in English. The reported build instead retains all 1,444 keys in the compatibility fallback map. One catalog parity exception remains out of the measured route: `2. Run command: wsl --install`. With Chatbox's default i18next namespace separator (`:`), an unescaped colon inside this key is parsed as a namespace separator. Reproducing the pinned app's i18next 22.5.1 setup returns ` wsl --install` for the French lookup; setting `nsSeparator: false` returns the full French catalog value, `2. Exécutez la commande : wsl --install`. Paraglide treats the full string as a literal message key, so this is a difference in i18next key parsing, not plural handling. The current transformation leaves this key on the i18next compatibility path and does not claim all-locale or full-application parity from this one-route check.

The selected-locale integration is an app-local Vite prototype, not a supported Paraglide API. The app-only compatibility shim converts 1,828 literal calls and keeps dynamic calls and `<Trans>` through a bounded fallback facade. LCP here is a lab frontend measurement, not field Web Vitals; backend activity, persistence, and third-party traffic are absent. The report records the source pins, per-trial request graph, errors, and medians in [chatbox-paraglide-split-negative.json](results/chatbox-paraglide-split-negative.json).

The browser scripts consume already-built renderer directories:

```sh
node benchmark/real-apps/chatbox-browser-ab.mjs \
  /absolute/path/to/native/release/app/dist/renderer \
  /absolute/path/to/paraglide/release/app/dist/renderer

node benchmark/real-apps/chatbox-language-switch.mjs \
  /absolute/path/to/paraglide/release/app/dist/renderer
```

The A/B runner writes `results/chatbox-paraglide-split-negative.json` by default; pass a third path to choose another output file. The app transformation and build were performed in an isolated derived checkout, leaving the pinned native source tree unchanged.
