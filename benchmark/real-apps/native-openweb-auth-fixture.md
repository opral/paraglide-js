# Open WebUI sign-in route baseline

The pinned Open WebUI checkout `f8ae8a6c328946dc62cd0712961a0632574581bf` reaches its French unauthenticated sign-in route when a local read-only `/api/config` fixture enables login. The Python backend is absent; remaining APIs return 404 and external requests are blocked. This is an additional native baseline, not a Paraglide migration result.

Three cold Chromium 143 contexts under 80 ms RTT, 20 Mbps down / 2 Mbps up and 3× CPU, served from the production Vite build with Brotli-Q4, rendered `Connectez-vous à Open WebUI`, `E-mail`, `Mot de passe` and `Connexion` without page errors. Median FCP was 980 ms and LCP 1,428 ms. HTML plus same-origin resource bodies totalled 1,313,890 bytes; the browser's transfer count including headers was 1,333,690 bytes. Do not mix these denominators with other route comparisons.

The requested French and English chunks were `__aXcWf4.js` and `C7g3bSvY.js`, with 72,194 and 49,217 encoded body bytes. Locale data therefore accounts for about 9.2% of this route's body bytes. The all-locale catalog total is not what a native user downloads on this lazy-loading route.

[Replay script](native-openweb-auth-fixture.mjs) and [three original captures](results/native-openweb-auth-fixture.json) retain the fixture, request graph and environment. The separate no-backend splash-shell observation remains in the native survey and is not treated as translated-page performance.
