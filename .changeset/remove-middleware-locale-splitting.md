---
"@inlang/paraglide-js": major
---

Remove `experimentalMiddlewareLocaleSplitting` for Paraglide v3, including its compiler option, runtime message tracking, and middleware HTML script injection. Generated runtimes no longer export `trackMessageCall` or `experimentalMiddlewareLocaleSplitting`, and async local storage no longer tracks message calls.

Per-locale builds are the recommended way to ship only the active locale's messages. Remove `experimentalMiddlewareLocaleSplitting` from your configuration and use `experimentalPerLocaleBuild: true` for supported Vite applications. Per-locale builds require full-document navigation when switching locales and a deployment that selects the matching locale output. See the [per-locale build guide](https://paraglidejs.com/compiling-messages#experimental-per-locale-builds) for framework and deployment constraints.
