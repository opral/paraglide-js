import fs from "node:fs";
import path from "node:path";
import { configuration } from "./run-case.mjs";
const { results, rounds } = configuration();
const rows = fs
	.readFileSync(path.join(results, "results.jsonl"), "utf8")
	.trim()
	.split("\n")
	.filter(Boolean)
	.map(JSON.parse);
if (rows.some((row) => row.diagnosticProfile))
	throw new Error(
		"Profiled trials cannot be summarized as unprofiled timing medians"
	);
const median = (values) =>
	[...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const groups = new Map();
for (const row of rows) {
	const key = `${row.mode}/${row.size}/${row.backend}/${row.layout}`;
	const group = groups.get(key) ?? [];
	group.push(row);
	groups.set(key, group);
}
const summary = [...groups].map(([group, trials]) => {
	if (
		trials.length !== rounds ||
		new Set(trials.map((trial) => trial.round)).size !== rounds
	)
		throw new Error(`Expected ${rounds} distinct rounds: ${group}`);
	if (
		trials[0].backend !== "grai" &&
		new Set(trials.map((trial) => trial.hash)).size !== 1
	)
		throw new Error(`Output changed between trials: ${group}`);
	return {
		group,
		size: trials[0].size,
		backend: trials[0].backend,
		layout: trials[0].layout,
		mode: trials[0].mode,
		trials: rounds,
		totalMs: median(trials.map((trial) => trial.totalMs)),
		importMs: median(trials.map((trial) => trial.importMs)),
		coldWithImportMs: median(trials.map((trial) => trial.coldWithImportMs)),
		minMs: Math.min(...trials.map((trial) => trial.totalMs)),
		maxMs: Math.max(...trials.map((trial) => trial.totalMs)),
		phases: Object.fromEntries(
			Object.keys(trials[0].phases).map((phase) => [
				phase,
				median(trials.map((trial) => trial.phases[phase])),
			])
		),
		files: trials[0].files,
		dts: trials[0].dts,
		bytes: trials[0].bytes,
		hash: trials[0].hash,
		pluginSha256: trials[0].pluginSha256,
	};
});
const pairs = [];
for (const size of [...new Set(rows.map((row) => row.size))])
	for (const layout of ["default", "locale", "shards"]) {
		const comparable = summary.filter(
			(row) =>
				row.size === size && row.layout === layout && row.backend !== "grai"
		);
		if (comparable.length < 2) continue;
		const equal = new Set(comparable.map((row) => row.hash)).size === 1;
		pairs.push({
			size,
			layout,
			backends: comparable.map((row) => row.backend),
			equal,
		});
		if (!equal)
			throw new Error(`Paired generated output differs: ${size}/${layout}`);
	}
fs.writeFileSync(
	path.join(results, "summary.json"),
	JSON.stringify({ groups: summary, pairs }, null, 2) + "\n"
);
console.log(JSON.stringify({ groups: summary, pairs }, null, 2));
