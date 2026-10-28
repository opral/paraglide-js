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
	"paraglide-per-locale": "Paraglide · per locale",
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
const localeCount = scenarios.length;
if (
	data.graphValidation.lazyRouteIsolation !== localeCount ||
	data.graphValidation.inactiveLocaleIsolation !== localeCount
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
const perLocale = example("paraglide-per-locale"),
	httpRoutes = example("i18next-http-routes");
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
description: "Compare Paraglide JS and i18next: translated DOM readiness, Brotli transfer, per-locale splitting, and reproducible Vite 8 results."
---

# Paraglide JS vs i18next benchmark

Compare **translated DOM readiness** and **Brotli transfer** for the same Vite 8 app: default and per-locale Paraglide JS, bundled i18next, and two HTTP-backend configurations.

## Main findings

- **Per-locale Paraglide reaches translated DOM readiness sooner in ${stats.initialReadyWins}/${stats.comparisonCount} pairwise comparisons** against i18next. Initial and journey transfer are smaller in ${stats.initialByteWins}/${stats.comparisonCount} and ${stats.journeyByteWins}/${stats.comparisonCount} comparisons, respectively.
- **Default Paraglide has transfer tradeoffs:** initial or journey bytes exceed an i18next configuration in ${data.overview.byteLosses}/${data.overview.comparisonCount} comparisons. All results remain visible below.

With ten locales, 200 messages used per route, and a 1,000-message catalog, per-locale Paraglide reaches readiness in ${ms(perLocale.steps.initial.readyMs.median)} with ${kib(perLocale.initialWire.median)} initial transfer; route-based HTTP i18next takes ${ms(httpRoutes.steps.initial.readyMs.median)} and ${kib(httpRoutes.initialWire.median)}. These are five-run medians from one host and network profile, not universal rankings.

## Interactive examples

Filter locale counts, message counts, and metrics. Complete scenario tables follow.

<div data-benchmark-explorer=""></div>

## Translated DOM readiness

Navigation start until translated text is inserted into the DOM, including loading, initialization, translation, and DOM updates. **This is not paint, LCP, INP, or general interaction readiness.** Lower is better; downloadable data retains minimum, median, and maximum values.

${table((r) => ms(r.steps.initial.readyMs.median))}

## Initial transfer size

Chromium-measured Brotli responses, including response headers. KiB means 1,024 bytes; lower is better.

${table((r) => kib(r.initialWire.median))}

## Full journey transfer size

Total bytes across the journey below, including one document reload when changing language. Caches remain active within each journey.

${table((r) => kib(r.journeyWire.median))}

## Methodology

### Same working application

All five configurations render identical text, interpolation, plurals, dates, and five lazy routes with 20 shared messages. Distinct [Cal.diy translations, source hashes, and MIT license](https://github.com/opral/paraglide-js/tree/main/benchmark/corpus) are retained. Fixed-hash selection is independent of results; naturally identical labels remain.

The matrix covers 2/5/10 locales, 200/1,000/4,000 catalog messages, and 50/200 used messages per route. Combinations unable to supply five routes are excluded. Common/route namespaces partition the catalog; these are controlled boundaries, not Cal.diy's routes.

Selection targets 20% interpolation until eligible strings run out. Rich markup, nested translations, contextual/plural source keys, and incompatible placeholders are excluded. Supplemental plurals test counts 0, 1, 2, 3, 11, and 100. Dates use identical native Intl code.

### Implementations

| Implementation | Translation loading |
| --- | --- |
| Paraglide JS | Message modules; unused messages removed, retained messages include every locale |
| Paraglide · per locale | Fixed-locale builds with message modules and static references |
| i18next bundled | All locales and namespaces bundled as compact objects |
| i18next HTTP catalog | Official HTTP backend; complete active-locale catalog |
| i18next HTTP routes | Official HTTP backend; active-locale common/route namespaces |

Per-locale settings: \`experimentalPerLocaleBuild: true\` and \`outputStructure: "message-modules"\`.

Per-locale results use the compiler in this repository; downloadable metadata records source and compiled hashes. Vite groups message modules into page/shared chunks, without per-message requests. Dynamic namespace indexing can retain additional messages. See the [per-locale setup and framework constraints](/compiling-messages).

Page code and translations load concurrently. Fixed-locale graphs avoid startup locale setters. HTTP variants disable fallback languages and retain resource caching; finer namespaces can reduce unused data further.

### Correctness before performance

All **${data.validation.builds} configurations** pass **${data.validation.stringsChecked.toLocaleString("en-US")} string checks and ${data.validation.pluralAssertions.toLocaleString("en-US")} plural assertions** across every locale/route. Timed journeys recheck text, interpolation, dates, plurals, and route/locale state. Errors, failed requests, or missing compression abort measurement. Requested-JavaScript checks verify route and locale isolation in all **${data.graphValidation.lazyRouteIsolation} per-locale configurations**, using markers observable after navigation.

### Browser journey and conditions

Each of **${data.validation.journeys} journeys** starts with a fresh browser context: English route 0 → English route 1 → document navigation to the last configured locale on route 1 → revisit route 0. Every implementation reloads once. Preflight checks never warm measured contexts.

Trials run sequentially with rotated order: **40 ms latency, 10 Mbps down, 5 Mbps up, 4× CPU slowdown, Brotli quality 5**. Vite's default minification/module preloading remain enabled; no custom initial-route hints are added.

Five-run medians do not establish statistical significance across devices. Per-locale builds are experimental. This plain-Vite client-rendered fixture does not establish SSR/hydration behavior or TanStack Start/SvelteKit compatibility. Source maps are disabled; keep message-module maps private because they can contain inactive-locale branches.

### Versions and data

Measured ${measured}. Pinned packages: Paraglide **${data.versions["@inlang/paraglide-js"]}**, i18next **${data.versions.i18next}**, HTTP backend **${data.versions["i18next-http-backend"]}**, Vite **${data.versions.vite}**, Playwright **${data.versions.playwright}**. Host: ${data.environment.platform} ${data.environment.arch}, ${data.environment.cpu}, Node ${data.environment.node}, Chromium ${data.environment.chromium}.

- [Summary CSV](/benchmark-data/summary.csv)
- [Scenario results JSON](/benchmark-data/results.json)
- [Benchmark source](https://github.com/opral/paraglide-js/tree/main/benchmark)

## Reproduce and contribute

From the repository root:

\`\`\`sh
pnpm install --frozen-lockfile
pnpm --filter @inlang/paraglide-js-benchmark exec playwright install --only-shell chromium
pnpm --filter @inlang/paraglide-js-benchmark bench
\`\`\`

Use \`SMOKE=1\` for one scenario/repetition without replacing published results. Run \`pnpm --filter @inlang/paraglide-js-benchmark publish-results --saved\` to regenerate this page from saved data. Results render as HTML; JavaScript adds filtering.
`
);
console.log(
	`Published ${expected} configurations and ${data.validation.journeys} journeys`
);
