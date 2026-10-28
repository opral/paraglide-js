import fs from "node:fs/promises";
import { fixture } from "./fixture.mjs";
import { scenarios, variants, nameOf } from "./config.mjs";

const data = JSON.parse(await fs.readFile("results.json", "utf8"));
const correctness = JSON.parse(await fs.readFile("correctness.json", "utf8"));
const median = (values) => {
	const s = [...values].sort((a, b) => a - b);
	return s.length % 2
		? s[Math.floor(s.length / 2)]
		: (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};
const stats = (values) => ({
	median: median(values),
	min: Math.min(...values),
	max: Math.max(...values),
});
const summary = [];
for (const name of [...new Set(data.results.map((r) => r.name))]) {
	const trials = data.results.filter((r) => r.name === name);
	if (trials.some((r) => !r.valid))
		throw Error("Invalid case in final results");
	const row = {
		name,
		variant: trials[0].variant,
		total: trials[0].total,
		used: trials[0].used,
		localeCount: trials[0].localeCount,
		repeats: trials.length,
		initialWire: stats(trials.map((t) => t.steps[0].wireBytes)),
		journeyWire: stats(
			trials.map((t) => t.steps.reduce((sum, s) => sum + s.wireBytes, 0))
		),
		journeyReadyMs: stats(
			trials.map((t) => t.steps.reduce((sum, s) => sum + s.readyMs, 0))
		),
		initialDecoded: stats(trials.map((t) => t.steps[0].decodedBytes)),
		journeyRequests: stats(
			trials.map((t) => t.steps.reduce((sum, s) => sum + s.requestCount, 0))
		),
		steps: Object.fromEntries(
			trials[0].steps.map((step) => [
				step.step,
				{
					wire: stats(
						trials.map(
							(t) => t.steps.find((s) => s.step === step.step).wireBytes
						)
					),
					readyMs: stats(
						trials.map((t) => t.steps.find((s) => s.step === step.step).readyMs)
					),
					requests: stats(
						trials.map(
							(t) => t.steps.find((s) => s.step === step.step).requestCount
						)
					),
				},
			])
		),
	};
	summary.push(row);
}
const losses = [];
const comparisons = [];
for (const s of scenarios) {
	const p = summary.find((r) => r.name === nameOf(s, "paraglide"));
	if (!p) continue;
	for (const v of variants.filter((v) => v !== "paraglide")) {
		const other = summary.find((r) => r.name === nameOf(s, v));
		if (!other) continue;
		const c = {
			...s,
			competitor: v,
			initialParaglideBytes: p.initialWire.median,
			initialCompetitorBytes: other.initialWire.median,
			journeyParaglideBytes: p.journeyWire.median,
			journeyCompetitorBytes: other.journeyWire.median,
			initialParaglideReadyMs: p.steps.initial.readyMs.median,
			initialCompetitorReadyMs: other.steps.initial.readyMs.median,
			journeyParaglideReadyMs: p.journeyReadyMs.median,
			journeyCompetitorReadyMs: other.journeyReadyMs.median,
			initialParaglideReduction:
				1 - p.initialWire.median / other.initialWire.median,
			journeyParaglideReduction:
				1 - p.journeyWire.median / other.journeyWire.median,
		};
		comparisons.push(c);
		if (c.initialParaglideReduction < 0 || c.journeyParaglideReduction < 0)
			losses.push(c);
	}
}
await fs.writeFile(
	"summary.json",
	JSON.stringify(
		{
			versions: data.versions,
			settings: data.settings,
			summary,
			comparisons,
			losses,
		},
		null,
		2
	)
);
const csv = [
	"locales,totalMessages,usedMessages,variant,initialWireBytes,journeyWireBytes,initialDecodedBytes,initialReadyMedianMs,initialReadyMinMs,initialReadyMaxMs,journeyRequests",
];
for (const r of summary)
	csv.push(
		[
			r.localeCount,
			r.total,
			r.used,
			r.variant,
			r.initialWire.median,
			r.journeyWire.median,
			r.initialDecoded.median,
			r.steps.initial.readyMs.median.toFixed(1),
			r.steps.initial.readyMs.min.toFixed(1),
			r.steps.initial.readyMs.max.toFixed(1),
			r.journeyRequests.median,
		].join(",")
	);
await fs.writeFile("summary.csv", csv.join("\n") + "\n");
const fixtureStats = scenarios.map((s) => {
	const f = fixture(s);
	return {
		...s,
		interpolated: f.entries.filter((e) => Object.keys(e.inputs).length).length,
		sharedAcrossAllRoutes: 20,
		interpolatedPerRoute: f.routes.map(
			(route) => route.filter((e) => Object.keys(e.inputs).length).length
		),
		namespaceSizes: Object.fromEntries(
			["common", "route0", "route1", "route2", "route3", "route4"].map((ns) => [
				ns,
				f.entries.filter((e) => e.ns === ns).length,
			])
		),
		identicalToEnglish: Object.fromEntries(
			f.locales
				.filter((l) => l !== "en")
				.map((l) => [
					l,
					f.entries.filter((e) => e.values[l] === e.values.en).length,
				])
		),
		selectedSourceKeys: f.entries.map((e) => ({
			key: e.key,
			sourceKey: e.sourceKey,
			namespace: e.ns,
		})),
	};
});
await fs.writeFile(
	"fixture-manifest.json",
	JSON.stringify(fixtureStats, null, 2)
);
const kib = (n) => (n / 1024).toFixed(1);
let report = `# Fair i18n benchmark

This is a browser application benchmark of Paraglide and i18next with real, distinct translations. Results are reported as measured; no case is removed because a library loses. This run covers **${summary.length} builds and ${data.results.length} validated browser journeys**, with ${data.settings.repeats} repetitions each.

Versions: ${Object.entries(data.versions)
	.map(([k, v]) => `${k} ${v}`)
	.join(", ")}.

## Results

Initial / full journey wire transfer, KiB. The wire metric comes from Chromium's Network.loadingFinished.encodedDataLength and includes compressed payloads and response headers. The server actually sends Brotli at quality ${data.settings.brotliQuality}; the per-request logs record content encoding and cache behavior. Values are medians.

| Locales | Catalog | Used per route | Paraglide | i18next bundled | i18next HTTP global | i18next HTTP routes |
| --- | --- | --- | --- | --- | --- | --- |
`;
for (const s of scenarios) {
	const rows = variants.map((v) =>
		summary.find((r) => r.name === nameOf(s, v))
	);
	if (rows.some((r) => !r)) continue;
	report += `| ${s.localeCount} | ${s.total} | ${s.used} | ${rows.map((r) => `${kib(r.initialWire.median)} / ${kib(r.journeyWire.median)}`).join(" | ")} |\n`;
}
report += `
Paraglide loses the initial-load or full-journey byte comparison in **${losses.length} of ${comparisons.length} pairwise comparisons**. Individual steps and timing distributions are in summary.json; no aggregate score mixes bytes and latency.

Paraglide has lower median initial translated DOM readiness in ${comparisons.filter((c) => c.initialParaglideReadyMs < c.initialCompetitorReadyMs).length}/${comparisons.length} pairwise comparisons under this single network/CPU profile. Five repetitions support exploratory comparisons; they do not establish performance across other networks, hardware, or applications.

## Optimization target

The default Paraglide configuration ships the used messages for all configured locales. HTTP i18next can deliver only the active locale, which becomes competitive as the number of locales and used messages increases. The catalog-size sweep shows the complementary advantage: Paraglide's used-message payload remains approximately constant as unused catalog entries grow, while the broad HTTP namespaces get larger.

The next Paraglide experiment should evaluate locale-specific delivery while retaining route-level message tree-shaking. Its experimental per-locale build path should be a separately validated variant, including the full navigation and language-switch journey. These default-mode results must remain available as the baseline; smaller bytes from a broken client or an incomplete translation set must fail correctness checks.

## Initial translated DOM readiness

Milliseconds, median [minimum–maximum]. Readiness means the translated DOM has been populated; it does not imply that pixels have painted. These timings include resource loading, library initialization, and rendering, rather than merely measuring translation function calls.

| Locales | Catalog | Used per route | Paraglide | i18next bundled | i18next HTTP global | i18next HTTP routes |
| --- | --- | --- | --- | --- | --- | --- |
`;
for (const s of scenarios) {
	const rows = variants.map((v) =>
		summary.find((r) => r.name === nameOf(s, v))
	);
	if (rows.some((r) => !r)) continue;
	report += `| ${s.localeCount} | ${s.total} | ${s.used} | ${rows
		.map((r) => {
			const t = r.steps.initial.readyMs;
			return `${t.median.toFixed(0)} [${t.min.toFixed(0)}–${t.max.toFixed(0)}]`;
		})
		.join(" | ")} |\n`;
}
report += `

## Equivalent behavior and configurations

- All cases render the same selected messages and parameter values, five lazy-loaded routes, the same navigation and locale controls, plural output, and locale-sensitive dates.
- Paraglide uses normal message modules with static message references and all configured locales. Server code is removed explicitly because this cohort is client rendered. Locale state is explicit, without language detection plugins.
- Bundled i18next imports compact JavaScript resource objects with all locales and all namespaces. No raw JSON string is parsed at runtime. This is a simple bundled-resource baseline, clearly distinguished from the production-oriented HTTP variants.
- HTTP global loads one entire catalog for the active language. HTTP routes loads the active language's shared namespace and the active route namespace. Both use the official HTTP backend, with fallbackLng:false so nonexistent fallback files do not inflate requests. On language changes, i18next loads namespaces it has already used as dictated by its normal behavior.
- Route namespaces are mechanically partitioned: 20 common messages and five equal route pools. Each route uses all 20 common messages and 30 or 180 messages from its pool. This is a controlled fixture, not a reconstruction of Cal.diy routes. As catalogs grow, namespaces include more unused messages; this measures sensitivity to namespace granularity. The smallest catalog is an especially tight partition.
- Five routes use the same code-splitting boundaries. The measured journey is: cold English route 0 → English route 1 → switch to the last configured locale → revisit route 0 → switch back to English. The browser context stays alive within that journey, so normal caching applies.

## Corpus and correctness

Translation files are snapshots from the public Cal.diy repository, with source blob hashes and URLs in corpus/sources.json and upstream licensing in corpus/LICENSE. The selection order uses a fixed SHA-256 seed, independent of results. Only nonempty strings available in all ten locales are eligible. Rich markup, nesting, contextual/plural source keys, and incompatible placeholder sets are excluded from this text-only cohort. No strings are replaced with copies of English. Naturally identical labels remain; their counts are published.

The fixture aims for 20% interpolated messages until eligible interpolated source strings are exhausted. Actual counts and source-key mappings are in fixture-manifest.json. Supplemental, explicitly authored plural messages exercise locale categories at counts 0, 1, 2, 3, 11, and 100. Date formatting uses the same native Intl code in every variant; this does not claim to benchmark differing formatting APIs.

Source keys are normalized to identical fixed-length IDs in both implementations, with the original keys retained in the manifest. This keeps semantic key length out of the comparison and avoids accidentally interpreting underscore-containing source keys as contextual messages.

Every journey checks every rendered message against an independent source-string interpolator, plus the expected locale, route, date, and plural outputs. Page errors, console errors, failed requests, wrong translations, or missing compression abort the run instead of contributing a smaller but broken result.

A separate preflight checks all configured locales and all five routes for every build: ${correctness.reduce((sum, r) => sum + r.messagesChecked, 0)} rendered strings and ${correctness.reduce((sum, r) => sum + r.pluralAssertions, 0)} plural outputs passed. Its browser contexts are closed before timed trials, so these checks do not warm the measured cache. Detailed checks are in correctness.json.

## Measurement and reproduction

The same Vite version, browser, app shell, minifier, server, and cache policy apply to all variants. Vite's standard production module preloading remains enabled. Data and JavaScript both use real Brotli responses. HTML is revalidated; resources use a long-lived browser cache. Each repetition gets a fresh browser context. Trials run sequentially, rotating their order between rounds. Network conditions are ${data.settings.latencyMs} ms emulated latency and ${data.settings.downloadBytesPerSecond} bytes/second download throughput, with ${data.settings.cpuSlowdown}x CPU throttling.

Raw JSON retains every request, cached status, encoded wire bytes, decoded body bytes, step latency, version, and host information. Timing summaries include median, minimum, and maximum over five repetitions; these are exploratory timing measurements on one host, not statistically powered performance claims. Build durations are diagnostic only and are not included in the winner comparison.

\`\`\`sh
cd benchmark
pnpm install --frozen-lockfile
node node_modules/playwright/cli.js install --only-shell chromium
pnpm run bench
\`\`\`

The corpus and compiler plugin are local snapshots/dependencies, so builds do not fetch moving remote translation plugins. Generated projects are isolated and recreated before compilation. There is no inherited cached server-rendering module.

## Scope and limitations

This cohort measures client-rendered applications. It does not establish results for SSR, server-only translations, hydration, experimental locale splitting, rich text, missing translations, or runtime-defined keys. It does not compare every possible optimization: i18next also supports dynamic-import backends, and Paraglide supports other deployment configurations. The primary table compares these four documented configurations only. The large catalogs' broad route pools are a controlled stress test; finer i18next namespaces can reduce their unused payloads. The timing network model represents a single connection profile, and all served assets share one local origin.

## Files

- [Summary CSV](summary.csv), [summary and comparisons JSON](summary.json)
- [All browser measurements](results.json)
- [Fixture selection and namespace manifest](fixture-manifest.json)
- [Build manifest](build-manifest.json)
- [Raw upstream corpus provenance](corpus/sources.json)
- [Source hashes for reproducibility](run-source-hashes.json)

A diagnostic run with module preloading disabled is preserved under diagnostics/no-module-preload. That inherited setting added avoidable request waterfalls; it is excluded from the primary results, which use Vite's production defaults for every variant. The earlier completed Vite 6 run is preserved under diagnostics/vite-6. The primary run uses Vite 8.3.5 with its default Rolldown/Oxc production pipeline, without forcing the old esbuild minifier. Comparing those runs measures the production pipeline upgrade, not a single isolated bundler change.

Configuration documentation: [i18next namespaces](https://www.i18next.com/principles/namespaces), [i18next loading resources](https://www.i18next.com/how-to/add-or-load-translations), [Paraglide compiler options](https://paraglidejs.com/compiler-options), [Vite 8 production toolchain](https://vite.dev/blog/announcing-vite8).
`;
await fs.writeFile("RUN.md", report);
console.log(
	`${summary.length} configurations, ${data.results.length} journeys; ${losses.length}/${comparisons.length} pairwise byte losses for Paraglide.`
);
if (losses.length) console.log(JSON.stringify(losses, null, 2));
