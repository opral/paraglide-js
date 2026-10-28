import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

process.chdir(path.dirname(fileURLToPath(import.meta.url)));
const saved = process.argv.includes("--saved");
let data;
if (saved) {
	data = JSON.parse(await fs.readFile("results/results.json", "utf8"));
} else {
	const summary = JSON.parse(await fs.readFile("summary.json", "utf8"));
	const raw = JSON.parse(await fs.readFile("results.json", "utf8"));
	const checks = JSON.parse(await fs.readFile("correctness.json", "utf8"));
	if (
		raw.results.length !== 300 ||
		raw.results.some((r) => !r.valid || r.steps.length !== 5) ||
		summary.summary.length !== 60 ||
		summary.summary.some((r) => r.repeats !== 5) ||
		checks.length !== 60 ||
		checks.some((r) => !r.valid)
	) {
		throw Error(
			"Publish only the full validated matrix: 60 builds, five trials each"
		);
	}
	data = {
		measuredAt: raw.measuredAt,
		versions: raw.versions,
		settings: raw.settings,
		environment: raw.environment,
		validation: {
			builds: checks.length,
			journeys: raw.results.length,
			stringsChecked: checks.reduce((sum, r) => sum + r.messagesChecked, 0),
			pluralAssertions: checks.reduce((sum, r) => sum + r.pluralAssertions, 0),
		},
		overview: {
			comparisonCount: summary.comparisons.length,
			initialReadyWins: summary.comparisons.filter(
				(c) => c.initialParaglideReadyMs < c.initialCompetitorReadyMs
			).length,
			byteLosses: summary.losses.length,
		},
		summary: summary.summary.map((r) => ({
			variant: r.variant,
			localeCount: r.localeCount,
			used: r.used,
			total: r.total,
			initialWire: { median: r.initialWire.median },
			journeyWire: { median: r.journeyWire.median },
			steps: Object.fromEntries(
				Object.entries(r.steps).map(([step, s]) => [
					step,
					{ readyMs: s.readyMs },
				])
			),
		})),
	};
	await fs.mkdir("results", { recursive: true });
	// One scenario per line keeps the published snapshot compact and reviewable.
	const { summary: rows, ...metadata } = data;
	await fs.writeFile(
		"results/results.json",
		JSON.stringify(metadata, null, 2).slice(0, -2) +
			',\n  "summary": [\n' +
			rows.map((r) => "    " + JSON.stringify(r)).join(",\n") +
			"\n  ]\n}\n"
	);
	await fs.copyFile("summary.csv", "results/summary.csv");
}
const variants = [
	"paraglide",
	"i18next-bundled",
	"i18next-http-global",
	"i18next-http-routes",
];
const groups = data.summary
	.filter((r) => r.variant === "paraglide")
	.map((p) =>
		variants.map((v) =>
			data.summary.find(
				(r) =>
					r.variant === v &&
					r.localeCount === p.localeCount &&
					r.used === p.used &&
					r.total === p.total
			)
		)
	);
if (groups.some((rows) => rows.some((r) => !r)))
	throw Error("Missing implementation");
const header =
	"| Locales | Used messages | Catalog messages | Paraglide JS | i18next bundled | i18next HTTP catalog | i18next HTTP routes |\n| --- | --- | --- | --- | --- | --- | --- |\n";
const table = (metric) =>
	header +
	groups
		.map(
			(rows) =>
				`| ${rows[0].localeCount} | ${rows[0].used} | ${rows[0].total} | ${rows.map(metric).join(" | ")} |`
		)
		.join("\n");
const ready = table((r) => `${r.steps.initial.readyMs.median.toFixed(0)} ms`);
const bytes = table((r) => `${(r.initialWire.median / 1024).toFixed(1)} KiB`);
const wins = data.overview.initialReadyWins;
const example = (variant) =>
	data.summary.find(
		(r) =>
			r.localeCount === 10 &&
			r.used === 200 &&
			r.total === 1000 &&
			r.variant === variant
	);
const exampleParaglide = example("paraglide"),
	exampleHttp = example("i18next-http-routes");
const measured = new Date(data.measuredAt).toLocaleDateString("en-US", {
	year: "numeric",
	month: "long",
	day: "numeric",
	timeZone: "America/Mexico_City",
});
const markdown = `---
description: Compare Paraglide JS and i18next with real translations, Vite 8, Brotli transfer, and validated browser journeys. Explore translated DOM readiness and download size.
---

# Paraglide JS vs i18next benchmark

How quickly does a translated page become ready? This benchmark compares **translated DOM readiness** for the same client-rendered application using Paraglide JS, bundled i18next, and i18next with an HTTP backend. It also measures actual Brotli transfer size, navigation, and language switching.

## Main findings

- **Paraglide reaches translated DOM readiness sooner in ${wins}/${data.overview.comparisonCount} comparisons** in this test profile, based on medians of five runs.
- **Transfer size has tradeoffs.** Paraglide beats bundled i18next in every tested scenario, but transfers more bytes in ${data.overview.byteLosses}/${data.overview.comparisonCount} initial-load or full-journey comparisons against the other implementations. HTTP i18next can be smaller when many locales and messages are configured.
- **Tree-shaking limits the cost of unused messages.** Paraglide's payload stays approximately constant as unused catalog entries grow. Its default setup still includes the used messages for every configured locale; HTTP backends can fetch only the active language.

These are results for one application, host, and network profile. They are not a guarantee for every website. The complete results, including Paraglide's size losses, appear below.

## Interactive examples

Explore locale counts, message counts, readiness, and transfer size. Complete results for every scenario are listed below.

<div data-benchmark-explorer=""></div>

## Translated DOM readiness

The primary metric is the time from navigation start until translated text has been inserted into the DOM. It includes resource loading, library initialization, translation, and DOM updates. **It does not measure first paint, LCP, INP, or general interaction readiness.** Lower is better.

${ready}

Ranges across all five repetitions and per-step timings are available in the explorer and the downloadable data. The measurements do not establish statistical performance across other machines or network conditions.

## Initial transfer size

These are real Brotli responses, including response headers, measured by Chromium. KiB means 1,024 bytes. Lower is better. This is a companion metric, not a substitute for translated DOM readiness.

${bytes}

For example, with ten locales, 200 used messages, and a 1,000-message catalog, Paraglide transfers about ${(exampleParaglide.initialWire.median / 1024).toFixed(0)} KiB versus about ${(exampleHttp.initialWire.median / 1024).toFixed(0)} KiB for route-based HTTP i18next, while reaching translated DOM readiness in about ${exampleParaglide.steps.initial.readyMs.median.toFixed(0)} ms versus about ${exampleHttp.steps.initial.readyMs.median.toFixed(0)} ms in this run. The default Paraglide configuration ships used messages for all locales. Locale-specific delivery is the next optimization to evaluate.

## Methodology

### Same working application

All four implementations render the same text, interpolation values, five lazy-loaded routes, language controls, plural output, and locale-sensitive dates. The corpus contains distinct translations from Cal.diy's public translation files, with source hashes and the upstream MIT license retained in the benchmark source. Source-key mappings are generated locally. Naturally identical labels remain; the fixture does not replace translations with copies of English.

The matrix covers 2, 5, and 10 locales; catalogs of 200, 1,000, and 4,000 messages; and 50 or 200 used messages per route. Combinations that cannot supply five routes' messages are excluded before measurement. Twenty messages are shared across routes. Route namespaces partition the remaining catalog evenly; this is a controlled fixture, not a reconstruction of Cal.diy's application routes.

The selection uses a fixed hash seed independent of results. It aims for 20% interpolated messages until eligible source strings are exhausted. Rich markup, nested translation calls, contextual/plural source keys, and incompatible placeholder sets are excluded from this text-only corpus. Supplemental plural messages test counts 0, 1, 2, 3, 11, and 100. Every implementation uses the same native Intl date-formatting code.

### Implementations

| Implementation | Translation loading |
| --- | --- |
| Paraglide JS | Standard message modules, static message references, automatic removal of unused messages; used messages include all configured locales |
| i18next bundled | Compact resource objects containing all locales and namespaces, bundled with the app |
| i18next HTTP catalog | Official HTTP backend; one complete catalog for the active language |
| i18next HTTP routes | Official HTTP backend; the active language's common and route namespaces |

HTTP variants disable missing fallback languages and retain normal i18next resource caching. Changing language loads namespaces already used by the application. Finer namespaces can reduce unused data further; the results do not represent every possible configuration.

### Correctness before performance

All 60 builds pass checks across every configured locale and all five routes: **${data.validation.stringsChecked.toLocaleString("en-US")} rendered strings and ${data.validation.pluralAssertions.toLocaleString("en-US")} plural outputs**. The tests independently compare rendered strings to the source catalog and verify interpolation, plural categories, dates, route state, and locale state. Page errors, console errors, failed requests, incorrect translations, and missing compression abort measurement.

### Browser journey and conditions

Each of 300 measured journeys starts with an empty browser-context cache: English route 0 → English route 1 → switch to the last configured locale → revisit route 0 → switch back to English. Caches remain active within the journey. Separate correctness checks do not warm the measured browser contexts.

Trials run sequentially, with order rotated between rounds. Conditions are 40 ms emulated network latency, 10 Mbps download, 5 Mbps upload, and 4× CPU throttling. The server sends Brotli at quality 5. Vite's production module preloading and default minifier remain enabled for every implementation. Timing means translated DOM readiness, not a translation-function microbenchmark.

This cohort covers client rendering. It does not establish results for SSR, hydration, server-only translations, experimental locale splitting, rich text, missing translations, or runtime-defined message keys.

### Versions and data

Measured ${measured}. Paraglide JS **${data.versions["@inlang/paraglide-js"]}**, i18next **${data.versions.i18next}**, HTTP backend **${data.versions["i18next-http-backend"]}**, Vite **${data.versions.vite}**, Playwright **${data.versions.playwright}**. Host: macOS arm64, Node ${data.environment.node}, Chromium ${data.environment.chromium}. Dependencies are pinned in the lockfile.

- [Download the summary CSV](/benchmark-data/summary.csv)
- [Download scenario results JSON](/benchmark-data/results.json)
- [Benchmark source and reproduction instructions](https://github.com/opral/paraglide-js/tree/main/benchmark)

## Reproduce and contribute

From the repository root, install dependencies with \`pnpm install --frozen-lockfile\`. Then run:

\`\`\`sh
pnpm --filter @inlang/paraglide-js-benchmark exec playwright install --only-shell chromium
pnpm --filter @inlang/paraglide-js-benchmark bench
\`\`\`

The benchmark builds the matrix, checks every locale and route, runs five browser repetitions, and generates the published result files and this page. Detailed request logs, correctness diagnostics, and fixture mappings stay in ignored local output files; only the compact scenario results and CSV are committed. Builds use the pinned published compiler so the published measurements can be reproduced. Test an optimization as a separately identified variant and retain the baseline and any losses.

Use \`pnpm --filter @inlang/paraglide-js-benchmark publish-results --saved\` to regenerate the page and explorer from the committed scenario results without rerunning browser trials. Human and machine readers receive the same results; filtering does not remove the complete static tables.
`;
await fs.writeFile("README.md", markdown);
