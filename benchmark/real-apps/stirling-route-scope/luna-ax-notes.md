# Luna review notes: consumer-scoped locale payloads

This was a code-and-route review, not a user study. Luna reviewed the client-scoped facade and then read the route measurements against the optimized native baseline.

- The generated message calls remained ordinary named message imports, but the app benchmark still needed an app-local migration shim. That work is not a supported migration path and the static-call shim does not prove parity for dynamic keys or React `<Trans>`.
- The Vite build injected a preload module that awaited `startupLocalePromise`, but the scoped core set that promise to `Promise.resolve()`. When consumers had been rewritten to scoped facades, the preload did no locale work; locale payload requests started as those facades evaluated. This left a request waterfall before the UI could render.
- The 10-pair route result confirmed the concern: 237 resources versus 60 for native, with FCP/LCP medians of 7,160/9,500 ms versus 820/2,092 ms. Transfer bytes were nearly tied (+0.30% for scoped output), so there was no byte reduction to compensate for the waterfall.
- The ownership model grouped by dynamic-entry owner sets, but one application route eagerly mounts code that looks like a separate route boundary. Build-graph reachability alone did not give a reliable page-level fetch plan.
- The prototype made key scoping less visible to the application author than a handwritten locale loader, but did not make migration intuitive end to end: the app still required an AST rewrite adapter, compatibility decisions for dynamic `t(...)`, and a source change to locale selection/preloading.

Luna recommended keeping the result as a negative design record, fixing the no-op preload and measuring real route request groups before any product integration. The follow-up full-catalog bridge experiment is separate and must preserve dynamic lookup, plurals, `<Trans>`, and fallback semantics before it can support a migration claim.
