import fs from "node:fs/promises";
import { fixture } from "./fixture.mjs";
import { scenarios, variants, nameOf } from "./config.mjs";

const data = JSON.parse(await fs.readFile("results.json", "utf8"));
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
console.log(
	`${summary.length} configurations, ${data.results.length} journeys; ${losses.length}/${comparisons.length} pairwise byte losses for Paraglide.`
);
if (losses.length) console.log(JSON.stringify(losses, null, 2));
