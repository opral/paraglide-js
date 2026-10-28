import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { scenarios, variants, settings } from "./config.mjs";
import { fixture } from "./fixture.mjs";
import { inspectLocaleGraphs } from "./check-locale-graphs.mjs";

const root = path.dirname(fileURLToPath(import.meta.url));
const output =
	process.env.BENCHMARK_OUTPUT ?? path.join(root, ".work/benchmark");
process.chdir(root);
const read = async (file) => JSON.parse(await fs.readFile(file, "utf8"));
const expected = scenarios.length * variants.length;
let data;
if (process.argv.includes("--saved")) {
	data = await read("results/results.json");
} else {
	const summary = await read(path.join(output, "summary.json"));
	const raw = await read(path.join(output, "results.json"));
	const checks = await read(path.join(output, "correctness.json"));
	if (
		raw.results.length !== expected * settings.repeats ||
		raw.results.some((r) => !r.valid || r.steps.length !== 4) ||
		summary.summary.length !== expected ||
		summary.summary.some((r) => r.repeats !== settings.repeats) ||
		checks.length !== expected ||
		checks.some((r) => !r.valid) ||
		raw.settings.languageSwitch !== "document" ||
		raw.settings.pageLoading !== "parallel"
	)
		throw Error("Publish only the complete validated per-locale matrix");
	data = {
		measuredAt: raw.measuredAt,
		versions: raw.versions,
		settings: raw.settings,
		environment: raw.environment,
		workspaceCompiler: await read(path.join(output, "compiler-source.json")),
		validation: {
			builds: checks.length,
			journeys: raw.results.length,
			stringsChecked: checks.reduce((sum, r) => sum + r.messagesChecked, 0),
			pluralAssertions: checks.reduce((sum, r) => sum + r.pluralAssertions, 0),
		},
		graphValidation: await inspectLocaleGraphs(output, raw, fixture),
		summary: summary.summary.map((r) => ({
			variant: r.variant,
			localeCount: r.localeCount,
			used: r.used,
			total: r.total,
			initialWire: r.initialWire,
			journeyWire: r.journeyWire,
			steps: Object.fromEntries(
				Object.entries(r.steps).map(([key, value]) => [
					key,
					{ readyMs: value.readyMs, wire: value.wire },
				])
			),
		})),
	};
	await fs.copyFile(path.join(output, "summary.csv"), "results/summary.csv");
}
const names = {
	paraglide: "Paraglide JS",
	"paraglide-per-locale-baseline": "Per locale · released",
	"paraglide-per-locale": "Per locale · optimized",
	"i18next-bundled": "i18next bundled",
	"i18next-http-global": "i18next HTTP catalog",
	"i18next-http-routes": "i18next HTTP routes",
};
const groups = scenarios.map((s) =>
	variants.map((variant) =>
		data.summary.find(
			(r) =>
				r.variant === variant &&
				r.localeCount === s.localeCount &&
				r.total === s.total &&
				r.used === s.used
		)
	)
);
if (
	data.summary.length !== expected ||
	groups.some((rows) => rows.some((r) => !r))
)
	throw Error("Missing implementation or scenario");
const optimizedCount = scenarios.length * 2;
if (
	data.graphValidation.lazyRouteIsolation !== optimizedCount ||
	data.graphValidation.inactiveLocaleIsolation !== optimizedCount
)
	throw Error("Incomplete route/locale isolation checks");
const comparisons = (variant) => {
	const pairs = groups.flatMap((rows) =>
		rows
			.filter((r) => r.variant.startsWith("i18next"))
			.map((other) => ({
				paraglide: rows.find((r) => r.variant === variant),
				other,
			}))
	);
	return {
		comparisonCount: pairs.length,
		initialReadyWins: pairs.filter(
			({ paraglide: p, other: o }) =>
				p.steps.initial.readyMs.median < o.steps.initial.readyMs.median
		).length,
		initialByteWins: pairs.filter(
			({ paraglide: p, other: o }) =>
				p.initialWire.median < o.initialWire.median
		).length,
		journeyByteWins: pairs.filter(
			({ paraglide: p, other: o }) =>
				p.journeyWire.median < o.journeyWire.median
		).length,
		byteLosses: pairs.filter(
			({ paraglide: p, other: o }) =>
				p.initialWire.median > o.initialWire.median ||
				p.journeyWire.median > o.journeyWire.median
		).length,
	};
};
data.overview = {
	...comparisons("paraglide"),
	perLocale: comparisons("paraglide-per-locale"),
};
const { summary: rows, ...metadata } = data;
await fs.writeFile(
	"results/results.json",
	JSON.stringify(metadata, null, 2).slice(0, -2) +
		',\n  "summary": [\n' +
		rows.map((r) => "    " + JSON.stringify(r)).join(",\n") +
		"\n  ]\n}\n"
);
const header = `| Locales | Used / route | Catalog | ${variants.map((v) => names[v]).join(" | ")} |\n| --- | --- | --- | ${variants.map(() => "---").join(" | ")} |\n`;
const table = (metric) =>
	header +
	groups
		.map(
			(rows) =>
				`| ${rows[0].localeCount} | ${rows[0].used} | ${rows[0].total} | ${rows.map(metric).join(" | ")} |`
		)
		.join("\n");
const kib = (bytes) => `${(bytes / 1024).toFixed(1)} KiB`;
const ms = (value) => `${value.toFixed(0)} ms`;
const example = (variant) =>
	data.summary.find(
		(r) =>
			r.localeCount === 10 &&
			r.used === 200 &&
			r.total === 1000 &&
			r.variant === variant
	);
const released = example("paraglide-per-locale-baseline"),
	optimized = example("paraglide-per-locale");
const reduction = (
	(1 - optimized.initialWire.median / released.initialWire.median) *
	100
).toFixed(1);
const measured = new Date(data.measuredAt).toLocaleDateString("en-US", {
	year: "numeric",
	month: "long",
	day: "numeric",
	timeZone: "America/Mexico_City",
});
const stats = data.overview.perLocale;
await fs.writeFile(
	"README.md",
	`---
description: Compare default and per-locale Paraglide JS with bundled and HTTP i18next using Vite 8, real translations, Brotli transfer, and validated browser journeys.
---

# Paraglide JS vs i18next benchmark

How quickly does a translated page become ready? This benchmark compares **translated DOM readiness** and actual Brotli transfer for the same client-rendered application. It includes default Paraglide, per-locale message modules before and after a compiler optimization, bundled i18next, and two HTTP-backend configurations.

## Main findings

- **Optimized per-locale Paraglide reaches translated DOM readiness sooner in ${stats.initialReadyWins}/${stats.comparisonCount} comparisons** against the three i18next configurations, using medians of five runs.
- **Optimized per-locale transfer is smaller in ${stats.initialByteWins}/${stats.comparisonCount} initial-load and ${stats.journeyByteWins}/${stats.comparisonCount} full-journey comparisons.** All results, including losses, remain visible below.
- **Per-locale message modules preserve locale, route, and message pruning.** The build selects one locale, static references remove unused messages, and lazy pages keep their private messages out of the initial download. Vite groups source modules into page/shared chunks; it does not request each message separately.
- **Inlining reduces generated code further.** With ten locales, 200 messages used per route, and a 1,000-message catalog, it reduces initial transfer from ${kib(released.initialWire.median)} to ${kib(optimized.initialWire.median)} (${reduction}%). Small timing differences between the released and optimized compiler do not establish an additional latency benefit.

These results cover one application, host, and network profile. They do not establish universal rankings or statistical significance. Default multilingual Paraglide remains visible: it has ${data.overview.byteLosses}/${data.overview.comparisonCount} comparisons where initial or journey transfer exceeds an i18next configuration.

## Interactive examples

Explore locale counts, message counts, readiness, and transfer size. Complete static tables for every scenario follow the explorer and are available without JavaScript.

<div data-benchmark-explorer=""></div>

## Translated DOM readiness

The primary metric is navigation start until translated text is inserted into the DOM. It includes resource loading, initialization, translation, and DOM updates. **It does not measure first paint, LCP, INP, or general interaction readiness.** Lower is better.

${table((r) => ms(r.steps.initial.readyMs.median))}

The explorer and downloadable JSON retain minimum, median, and maximum timings across all five repetitions.

## Initial transfer size

Real Brotli responses measured by Chromium, including response headers. KiB means 1,024 bytes. Lower is better.

${table((r) => kib(r.initialWire.median))}

## Full journey transfer size

All implementations follow the same journey and reload the document once when switching language. Browser caches stay active within that journey, including across the reload.

${table((r) => kib(r.journeyWire.median))}

## Methodology

### Same working application

All six implementations render the same text, interpolation values, five lazy-loaded routes, language controls, plural output, and locale-sensitive dates. The corpus contains distinct Cal.diy translations, with source hashes and the upstream MIT license retained. A fixed hash seed selects messages independently of results. Naturally identical labels remain; translations are not replaced with English copies.

The matrix covers 2, 5, and 10 locales; catalogs of 200, 1,000, and 4,000 messages; and 50 or 200 used messages per route. Combinations unable to supply five routes are excluded before measurement. Twenty messages are shared between routes. Route namespaces partition the remaining catalog evenly; these are controlled boundaries rather than Cal.diy's actual application routes.

The selection aims for 20% interpolated messages until eligible strings are exhausted. Rich markup, nested translations, contextual/plural source keys, and incompatible placeholder sets are excluded from the corpus. Supplemental plural messages test counts 0, 1, 2, 3, 11, and 100. Every variant uses identical native Intl date-formatting code.

### Implementations

| Implementation | Compiler and translation loading |
| --- | --- |
| Paraglide JS | Published ${data.versions["@inlang/paraglide-js"]}; standard message modules, static references, used messages in every configured locale |
| Per locale · released | Published ${data.versions["@inlang/paraglide-js"]}; \`experimentalPerLocaleBuild: true\` and \`outputStructure: "message-modules"\` |
| Per locale · optimized | Workspace compiler with message-body inlining enabled; otherwise the same per-locale/message-module setup |
| i18next bundled | All locales and namespaces bundled as compact resource objects |
| i18next HTTP catalog | Official HTTP backend; complete catalog for the active locale |
| i18next HTTP routes | Official HTTP backend; common and current-route namespaces for the active locale |

Page code and translation resources load concurrently for every implementation. Fixed-locale graphs do not call a locale setter at startup. HTTP variants disable fallback languages and retain normal resource caching. Finer namespaces can reduce unused HTTP data further; these results do not represent every possible application configuration.

The optimization places eligible message bodies directly inside their public message functions and removes unused helpers. Locale selection, fallbacks, markup, and locale-override warnings retain their existing contracts. The downloadable metadata identifies the workspace compiler source and compiled-module hashes; the other Paraglide rows use the pinned published package.

### Correctness before performance

All **${data.validation.builds} configurations** pass checks across every configured locale and all five routes: **${data.validation.stringsChecked.toLocaleString("en-US")} rendered strings and ${data.validation.pluralAssertions.toLocaleString("en-US")} plural outputs**. Every timed journey rechecks text, interpolation, dates, plural categories, and route/locale state. Page errors, failed requests, incorrect translations, and missing compression abort measurement.

Checks of JavaScript actually requested by Chromium verify lazy-route and inactive-locale isolation in all **${data.graphValidation.lazyRouteIsolation} per-locale configurations**. A marker must be observable after navigation or locale switching before its initial absence counts as evidence.

### Browser journey and conditions

Each of **${data.validation.journeys} measured journeys** starts in a fresh browser context: English route 0 → English route 1 → document navigation to the last configured locale on route 1 → revisit route 0. Every variant reloads once, including i18next. Caches remain active within a journey. Separate preflight checks do not warm measured contexts. This cohort replaces the earlier in-place switching results; the two workloads are not combined.

Trials run sequentially, with order rotated between rounds. Conditions: 40 ms emulated latency, 10 Mbps download, 5 Mbps upload, 4× CPU slowdown, Brotli quality 5, and Vite's default production minification and module preloading. No custom initial-route preload hints are added.

This is a plain Vite client-rendered fixture. Per-locale graphs use Vite's native \`createBuilder().buildApp()\` API. The results do not establish SSR/hydration behavior or compatibility with TanStack Start/SvelteKit build orchestration. Source maps are disabled; message-module maps can contain inactive locale branches and should remain private. Dynamic indexing of the complete message namespace can retain additional messages. Full document navigation selects another fixed-locale graph.

### Versions and data

Measured ${measured}. Published Paraglide **${data.versions["@inlang/paraglide-js"]}**, i18next **${data.versions.i18next}**, HTTP backend **${data.versions["i18next-http-backend"]}**, Vite **${data.versions.vite}**, Playwright **${data.versions.playwright}**. Host: ${data.environment.platform} ${data.environment.arch}, ${data.environment.cpu}, Node ${data.environment.node}, Chromium ${data.environment.chromium}. Dependencies are pinned in the lockfile.

- [Download summary CSV](/benchmark-data/summary.csv)
- [Download scenario results JSON](/benchmark-data/results.json)
- [Benchmark source](https://github.com/opral/paraglide-js/tree/main/benchmark)

## Reproduce and contribute

From the repository root:

\`\`\`sh
pnpm install --frozen-lockfile
pnpm --filter @inlang/paraglide-js-benchmark exec playwright install --only-shell chromium
pnpm --filter @inlang/paraglide-js-benchmark bench
\`\`\`

The runner builds the workspace compiler, builds the matrix, checks every locale/route, measures five sequential repetitions, and updates this page and the explorer's compact dataset. Only the two compact result files are committed. Raw trial logs, generated app builds, and diagnostics remain ignored under \`benchmark/.work/benchmark/\`.

Use \`SMOKE=1 pnpm --filter @inlang/paraglide-js-benchmark bench\` for one scenario and one repetition; smoke runs cannot overwrite published results. Use \`pnpm --filter @inlang/paraglide-js-benchmark publish-results --saved\` to regenerate this page from committed results. The page serves complete tables and the explorer's initial state as HTML for crawlers and readers without JavaScript.
`
);
console.log(
	`Published ${expected} configurations and ${data.validation.journeys} journeys`
);
